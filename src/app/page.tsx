"use client";

import { useState, useCallback, useEffect } from "react"; // Added useEffect
import { useDropzone } from "react-dropzone";
import type { ReIdentifyPersonOutput, ReIdentifyPersonInput, Snapshot } from "@/ai/flows/re-identify-person";
import { reIdentifyPerson } from "@/ai/flows/re-identify-person";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
// Input is not used, consider removing later
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, Upload, Video, Loader2, Image as ImageIcon, AlertCircle, Clock, ImageOff } from "lucide-react"; // Added Clock, ImageOff
import Image from "next/image"; // Use next/image for optimization
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { useToast } from "@/hooks/use-toast"; // Import useToast
import { Badge } from "@/components/ui/badge"; // Import Badge

// Placeholder data URI (simple gray square) - Should match the one in the flow
const placeholderDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACgtt2+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABDSURBVDhPY2AYYAAGEgYGDAlQw/z//z/DwsKCMjIyAAAA///fVAGIYvj7+4eFhQUAAAAA///vrgQ0MDBgfHx8AADsHBFsXnVsmwAAAABJRU5ErkJggg==';


export default function Home() {
  const [photoFile, setPhotoFile] = useState<File | null>(null); // Store file object
  const [videoFile, setVideoFile] = useState<File | null>(null); // Store file object
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [videoDataUri, setVideoDataUri] = useState<string | null>(null);
  const [result, setResult] = useState<ReIdentifyPersonOutput | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast(); // Initialize useToast

  // Preload placeholder image to potentially avoid layout shifts
  useEffect(() => {
    const img = new window.Image();
    img.src = placeholderDataUri;
  }, []);


  const onDropPhoto = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
       setPhotoFile(file); // Store the file object
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoDataUri(reader.result as string);
        setError(null); // Clear previous errors
        setResult(null); // Clear previous results
      };
      reader.onerror = () => {
         setError("Error reading photo file.");
         toast({ variant: "destructive", title: "Error", description: "Could not read the photo file." });
      }
      reader.readAsDataURL(file);
    }
  }, [toast]);

  const onDropVideo = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setVideoFile(file); // Store the file object
      const reader = new FileReader();
      reader.onload = () => {
        setVideoDataUri(reader.result as string);
         setError(null); // Clear previous errors
         setResult(null); // Clear previous results
      };
       reader.onerror = () => {
         setError("Error reading video file.");
          toast({ variant: "destructive", title: "Error", description: "Could not read the video file." });
      }
      reader.readAsDataURL(file);
    }
  }, [toast]);

  const { getRootProps: getPhotoRootProps, getInputProps: getPhotoInputProps, isDragActive: isPhotoDragActive } = useDropzone({
    onDrop: onDropPhoto,
    multiple: false,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.bmp', '.webp'],
    }
  });

  const { getRootProps: getVideoRootProps, getInputProps: getVideoInputProps, isDragActive: isVideoDragActive } = useDropzone({
    onDrop: onDropVideo,
    multiple: false,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.wmv', '.webm', '.mkv'], // Added mkv
    },
     maxSize: 100 * 1024 * 1024, // Example: Limit video size to 100MB
     onDropRejected: (rejectedFiles) => {
       const largeFile = rejectedFiles.find(f => f.errors.some(e => e.code === 'file-too-large'));
       if (largeFile) {
         setError("Video file is too large. Please upload a smaller video (e.g., under 100MB).");
         toast({ variant: "destructive", title: "File Too Large", description: "Video size exceeds the limit (100MB)." });
       } else {
           setError("Invalid video file type.");
           toast({ variant: "destructive", title: "Invalid File", description: "Please upload a supported video format." });
       }
     }
  });

  const handleReIdentify = async () => {
    if (!photoDataUri || !videoDataUri || !photoFile || !videoFile) {
      setError("Please upload both a photo and a video.");
      toast({ variant: "destructive", title: "Missing Files", description: "Please upload both a photo and a video." });
      return;
    }

    // Simple check for very large files before sending (optional, as dropzone handles it too)
     if (videoFile.size > 100 * 1024 * 1024) { // 100MB limit check
         setError("Video file is too large ( > 100MB). Processing might fail or be very slow.");
         toast({ variant: "destructive", title: "File Too Large", description: "Video size is very large. Consider using a shorter clip." });
         // Optionally return here if you want to strictly enforce the limit before sending
     }


    setLoading(true);
    setError(null);
    setResult(null);
    console.log("Starting re-identification process...");
    try {
      const input: ReIdentifyPersonInput = {
        photoDataUri: photoDataUri,
        videoDataUri: videoDataUri,
      };
      const reIdentificationResult = await reIdentifyPerson(input);
       console.log("Re-identification result received:", reIdentificationResult);
      setResult(reIdentificationResult);

      // Refined Toast logic based on result and snapshots
      if (reIdentificationResult.isPresent) {
        if (reIdentificationResult.snapshots && reIdentificationResult.snapshots.length > 0 && reIdentificationResult.snapshots.some(s => s.generationStatus === 'success')) {
           toast({ variant: "default", title: "Person Identified", description: "Snapshots generated successfully." });
        } else if (reIdentificationResult.snapshots && reIdentificationResult.snapshots.length > 0) {
            toast({ variant: "default", title: "Person Identified", description: "Snapshots generated, but some may be placeholders or failed." });
        } else {
             toast({ variant: "default", title: "Person Identified", description: "Could not generate snapshots for the identified person." });
        }
      } else if (!reIdentificationResult.isPresent && reIdentificationResult.reason) {
          // Optionally toast if not present but reason exists
           toast({ variant: "default", title: "Person Not Identified", description: "The person was not found in the video." });
      } else if (reIdentificationResult.reason.toLowerCase().includes("error")) {
          // If the reason indicates an error even if isPresent is false
           toast({ variant: "destructive", title: "Processing Issue", description: reIdentificationResult.reason });
      }


    } catch (err: any) {
      console.error("Error during re-identification call:", err);
      const errorMessage = `Processing failed: ${err.message || 'Unknown error'}`;
      setError(errorMessage);
      toast({ variant: "destructive", title: "Processing Error", description: errorMessage });
      setResult(null); // Ensure result is null on error
    } finally {
      setLoading(false);
      console.log("Re-identification process finished.");
    }
  };

  // Function to check if a data URI looks like a valid image and is not the placeholder
  const isValidAndNotPlaceholder = (uri: string | null | undefined): boolean => {
    return !!uri && uri.startsWith('data:image/') && uri.length > 200 && uri !== placeholderDataUri; // Basic check + length + placeholder check
  };

  const getSnapshotBadgeVariant = (status?: 'success' | 'failed' | 'placeholder'): "default" | "destructive" | "secondary" => {
      switch (status) {
          case 'success': return 'default'; // Greenish in default theme potentially
          case 'failed': return 'destructive'; // Red
          case 'placeholder': return 'secondary'; // Gray
          default: return 'secondary';
      }
  }
   const getSnapshotStatusText = (status?: 'success' | 'failed' | 'placeholder'): string => {
      switch (status) {
          case 'success': return 'Generated';
          case 'failed': return 'Failed';
          case 'placeholder': return 'Placeholder';
          default: return 'Unknown';
      }
  }


  return (
    <>
     <Toaster /> {/* Add Toaster component here */}
      <div className="container mx-auto flex flex-col items-center justify-center min-h-screen py-8 px-4">
        <h1 className="text-4xl font-bold mb-8 text-center text-primary">Person Re-Identification</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-2xl">Upload a clear photo of a person and a video (MP4, MOV, WEBM, etc., ideally under 100MB and less than a minute long) to see if the person appears in the video.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mb-6">
          {/* Photo Upload Card */}
          <Card className="shadow-md hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ImageIcon className="w-5 h-5 text-primary" /> Upload Photo</CardTitle>
              <CardDescription>Image of the person to find.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getPhotoRootProps()}
                className={`flex items-center justify-center w-full h-60 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors ${isPhotoDragActive ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'} relative overflow-hidden`} // Increased height
                 aria-label="Photo upload area"
              >
                <input {...getPhotoInputProps()} id="photo-upload" />
                 <label htmlFor="photo-upload" className="flex flex-col items-center justify-center text-center p-4 w-full h-full cursor-pointer z-10"> {/* Added cursor-pointer, z-index */}
                  {photoDataUri ? (
                    // Use next/image for uploaded photo preview
                     <div className="flex flex-col items-center">
                       <Image src={photoDataUri} alt="Uploaded Person Preview" width={150} height={150} className="max-h-40 w-auto rounded-md object-contain border bg-white shadow-sm mb-2" />
                       <span className="text-xs text-muted-foreground mt-1">(Click or drag to replace)</span>
                    </div>

                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">
                        {isPhotoDragActive ? "Drop photo here..." : "Click or drag photo"}
                      </span>
                      <span className="text-xs text-muted-foreground/80 mt-1">JPEG, PNG, GIF, etc.</span>
                    </>
                  )}
                </label>
                 {/* Optional: subtle background icon when empty */}
                 {!photoDataUri && <ImageIcon className="absolute w-24 h-24 text-muted/20 opacity-50 z-0" />}
              </div>
            </CardContent>
          </Card>

         {/* Video Upload Card */}
          <Card className="shadow-md hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Video className="w-5 h-5 text-primary"/> Upload Video</CardTitle>
              <CardDescription>Video to search within.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getVideoRootProps()}
                 className={`flex items-center justify-center w-full h-60 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors ${isVideoDragActive ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'} relative overflow-hidden`} // Increased height
                 aria-label="Video upload area"
              >
                <input {...getVideoInputProps()} id="video-upload" />
                 <label htmlFor="video-upload" className="flex flex-col items-center justify-center text-center p-4 w-full h-full cursor-pointer z-10"> {/* Added cursor-pointer, z-index */}
                  {videoDataUri ? (
                     <div className="flex flex-col items-center">
                      <Video className="h-10 w-10 text-primary mb-2" />
                      <span className="text-sm text-foreground font-medium">Video Selected</span>
                       {videoFile && <span className="text-xs text-muted-foreground/90 mt-1">{videoFile.name} ({(videoFile.size / (1024*1024)).toFixed(1)} MB)</span>}
                      <span className="text-xs text-muted-foreground mt-1">(Click or drag to replace)</span>
                    </div>
                  ) : (
                    <>
                      <Video className="h-10 w-10 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">
                         {isVideoDragActive ? "Drop video here..." : "Click or drag video"}
                      </span>
                       <span className="text-xs text-muted-foreground/80 mt-1">MP4, MOV, WEBM, etc. (&lt;100MB recommended)</span>
                    </>
                  )}
                </label>
                {/* Optional: subtle background icon when empty */}
                 {!videoDataUri && <Video className="absolute w-24 h-24 text-muted/20 opacity-50 z-0" />}
              </div>
            </CardContent>
          </Card>
        </div>

         {error && (
           <Alert variant="destructive" className="w-full max-w-4xl mb-6 shadow-md">
              <AlertCircle className="h-4 w-4" /> {/* Use AlertCircle for errors */}
             <AlertTitle>Error</AlertTitle>
             <AlertDescription>{error}</AlertDescription>
           </Alert>
         )}

        <Button
          onClick={handleReIdentify}
          disabled={loading || !photoDataUri || !videoDataUri}
          size="lg" // Make button larger
          className="px-10 py-6 text-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-shadow" // Added disabled styles, larger size, shadows
        >
          {loading ? (
            <>
              <Loader2 className="mr-3 h-6 w-6 animate-spin" /> Analyzing...
            </>
          ) : (
            "Identify Person in Video"
          )}
        </Button>

        {/* --- Result Section --- */}
        {result && (
          <Card className="w-full max-w-4xl mt-10 shadow-lg border-t-4 border-primary">
            <CardHeader>
              <CardTitle className="text-2xl text-center">Analysis Result</CardTitle>
            </CardHeader>
            <CardContent>
              <Alert variant={result.isPresent ? "default" : "destructive"} className={`mb-6 border-l-4 ${result.isPresent ? 'border-green-500 bg-green-50/30 dark:bg-green-900/20' : 'border-destructive bg-destructive/10'}`}>
                 <div className="flex items-start"> {/* Use items-start for better alignment */}
                   {result.isPresent ? (
                     <CheckCircle className="h-6 w-6 mr-3 text-green-600 dark:text-green-500 flex-shrink-0 mt-1" /> // Adjusted size/margin
                   ) : (
                     <XCircle className="h-6 w-6 mr-3 text-destructive flex-shrink-0 mt-1" /> // Adjusted size/margin
                   )}
                   <div className="flex-grow">
                      <AlertTitle className="font-semibold text-xl mb-1">
                        {result.isPresent ? "Person Identified" : "Person Not Identified"}
                      </AlertTitle>
                      <AlertDescription className="text-base">
                        {result.reason || (result.isPresent ? "The person appears to be present in the video." : "The person does not appear to be present in the video.")}
                        {result.confidence !== undefined && result.confidence !== null && (
                            <Badge variant="secondary" className="ml-2">Confidence: {result.confidence.toFixed(2)}</Badge>
                        )}
                      </AlertDescription>
                    </div>
                 </div>
                </Alert>


              {/* Snapshots Section */}
                {result.isPresent && result.snapshots && result.snapshots.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-border/50">
                    <h3 className="font-semibold text-lg mb-4 text-center">Generated Snapshots</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {result.snapshots.map((snapshot: Snapshot, index: number) => (
                        <Card key={index} className="flex flex-col items-center border rounded-lg p-3 bg-background/70 dark:bg-muted/40 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
                          <div className="w-full h-48 mb-3 relative bg-muted rounded-md border flex items-center justify-center overflow-hidden">
                            {isValidAndNotPlaceholder(snapshot.dataUri) ? (
                                <Image
                                  src={snapshot.dataUri}
                                  alt={`Generated Snapshot ${index + 1}`}
                                  layout="fill" // Use layout fill for responsive container
                                  objectFit="contain" // Fit image within container
                                  className="transition-transform duration-300 ease-in-out hover:scale-105"
                                  data-ai-hint="person identified snapshot"
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center text-muted-foreground text-center p-2">
                                    <ImageOff className="h-10 w-10 mb-2 text-destructive/50" />
                                    <span className="text-xs font-medium">{snapshot.generationStatus === 'failed' ? 'Generation Failed' : 'Placeholder Image'}</span>
                                    <span className="text-xs">Could not generate visual</span>
                                </div>
                            )}
                          </div>

                           <div className="flex items-center justify-between w-full text-sm text-muted-foreground mt-1 px-1">
                                <span className="flex items-center gap-1 font-medium">
                                     <Clock className="w-3.5 h-3.5" />
                                     {snapshot.timestamp.toFixed(2)}s
                                </span>
                                <Badge variant={getSnapshotBadgeVariant(snapshot.generationStatus)} className="text-xs">
                                  {getSnapshotStatusText(snapshot.generationStatus)}
                                </Badge>
                           </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                 {/* Message if person identified but no snapshots could be generated/shown */}
                 {result.isPresent && (!result.snapshots || result.snapshots.length === 0 || result.snapshots.every(s => !isValidAndNotPlaceholder(s.dataUri))) && (
                     <div className="mt-6 pt-6 border-t border-border/50 text-center">
                        <p className="text-base text-muted-foreground italic">Person identified, but visual snapshots could not be generated.</p>
                    </div>
                )}

            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
