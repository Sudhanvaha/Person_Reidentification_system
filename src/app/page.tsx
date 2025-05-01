"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import type { ReIdentifyPersonOutput, ReIdentifyPersonInput, Snapshot } from "@/ai/flows/re-identify-person";
import { reIdentifyPerson } from "@/ai/flows/re-identify-person";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input"; // Input is not used, consider removing later
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, Upload, Video, Loader2, Image as ImageIcon, AlertCircle } from "lucide-react"; // Added ImageIcon, AlertCircle
import Image from "next/image"; // Use next/image for optimization
import { Toaster } from "@/components/ui/toaster"; // Import Toaster
import { useToast } from "@/hooks/use-toast"; // Import useToast


export default function Home() {
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [videoDataUri, setVideoDataUri] = useState<string | null>(null);
  const [result, setResult] = useState<ReIdentifyPersonOutput | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast(); // Initialize useToast

  const onDropPhoto = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
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
      'video/*': ['.mp4', '.mov', '.avi', '.wmv', '.webm'],
    }
  });

  const handleReIdentify = async () => {
    if (!photoDataUri || !videoDataUri) {
      setError("Please upload both a photo and a video.");
      toast({ variant: "destructive", title: "Missing Files", description: "Please upload both a photo and a video." });
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const input: ReIdentifyPersonInput = {
        photoDataUri: photoDataUri,
        videoDataUri: videoDataUri,
      };
      const reIdentificationResult = await reIdentifyPerson(input);
      setResult(reIdentificationResult);
       if (reIdentificationResult.isPresent && (!reIdentificationResult.snapshots || reIdentificationResult.snapshots.length === 0)) {
          toast({ variant: "default", title: "Snapshots", description: "Person identified, but snapshot generation might have faced issues or returned no results." });
      }
    } catch (err: any) {
      console.error("Error during re-identification:", err);
      const errorMessage = `Error during processing: ${err.message || 'Unknown error'}`;
      setError(errorMessage);
      toast({ variant: "destructive", title: "Processing Error", description: errorMessage });
      setResult(null); // Ensure result is null on error
    } finally {
      setLoading(false);
    }
  };

  // Function to check if a data URI looks like a valid image
  const isValidImageDataUri = (uri: string | null | undefined): boolean => {
    return !!uri && uri.startsWith('data:image/') && uri.length > 50; // Basic check
  };


  return (
    <>
     <Toaster /> {/* Add Toaster component here */}
      <div className="container mx-auto flex flex-col items-center justify-center min-h-screen py-8 px-4">
        <h1 className="text-4xl font-bold mb-8 text-center text-primary">Person Re-Identification</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Photo</CardTitle>
              <CardDescription>Upload an image of the person to identify.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getPhotoRootProps()}
                className={`flex items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors ${isPhotoDragActive ? 'border-primary bg-primary/10' : 'border-border bg-muted/50'}`}
              >
                <input {...getPhotoInputProps()} id="photo-upload" aria-label="Photo upload area" />
                <label htmlFor="photo-upload" className="flex flex-col items-center justify-center text-center p-4 w-full h-full cursor-pointer"> {/* Added cursor-pointer here */}
                  {photoDataUri ? (
                    // Use next/image for uploaded photo preview
                    <Image src={photoDataUri} alt="Uploaded Person" width={150} height={150} className="max-h-36 w-auto rounded-md object-contain" />

                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">
                        {isPhotoDragActive ? "Drop the photo here..." : "Click or drag photo to upload"}
                      </span>
                      <span className="text-xs text-muted-foreground/80 mt-1">JPEG, PNG, GIF, BMP, WEBP</span>
                    </>
                  )}
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upload Video</CardTitle>
              <CardDescription>Upload a video to search for the person.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getVideoRootProps()}
                className={`flex items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors ${isVideoDragActive ? 'border-primary bg-primary/10' : 'border-border bg-muted/50'}`}
              >
                <input {...getVideoInputProps()} id="video-upload" aria-label="Video upload area" />
                <label htmlFor="video-upload" className="flex flex-col items-center justify-center text-center p-4 w-full h-full cursor-pointer"> {/* Added cursor-pointer here */}
                  {videoDataUri ? (
                     <div className="flex flex-col items-center">
                      <Video className="h-10 w-10 text-primary mb-2" />
                      <span className="text-sm text-foreground font-medium">Video Ready</span>
                      <span className="text-xs text-muted-foreground/80 mt-1">Click or drag to replace</span>
                    </div>
                  ) : (
                    <>
                      <Video className="h-10 w-10 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">
                         {isVideoDragActive ? "Drop the video here..." : "Click or drag video to upload"}
                      </span>
                       <span className="text-xs text-muted-foreground/80 mt-1">MP4, MOV, AVI, WMV, WEBM</span>
                    </>
                  )}
                </label>
              </div>
              {/* Removed video preview as it's large and potentially slow */}
            </CardContent>
          </Card>
        </div>

         {error && (
           <Alert variant="destructive" className="w-full max-w-4xl mb-6">
              <AlertCircle className="h-4 w-4" /> {/* Use AlertCircle for errors */}
             <AlertTitle>Error</AlertTitle>
             <AlertDescription>{error}</AlertDescription>
           </Alert>
         )}

        <Button
          onClick={handleReIdentify}
          disabled={loading || !photoDataUri || !videoDataUri}
          className="px-8 py-3 text-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed" // Added disabled:cursor-not-allowed
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Identifying...
            </>
          ) : (
            "Identify Person"
          )}
        </Button>

        {result && (
          <Card className="w-full max-w-4xl mt-8 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl">Re-identification Result</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Use standard Alert variants */}
              <Alert variant={result.isPresent ? "default" : "destructive"} className={`border-2 ${result.isPresent ? 'border-green-500 bg-green-50/50 dark:bg-green-900/20' : 'border-destructive/80'}`}>
                 <div className="flex items-center">
                   {result.isPresent ? (
                     <CheckCircle className="h-5 w-5 mr-2 text-green-600 dark:text-green-500" />
                   ) : (
                     <XCircle className="h-5 w-5 mr-2 text-destructive" />
                   )}
                   <AlertTitle className="font-semibold text-lg">
                     {result.isPresent ? "Person Identified" : "Person Not Identified"}
                   </AlertTitle>
                 </div>
                <AlertDescription className="mt-2 ml-7"> {/* Indent description */}
                  {result.reason}
                  {result.confidence && <span className="ml-2 font-medium">(Confidence: {result.confidence.toFixed(2)})</span>}
                </AlertDescription>

                {result.isPresent && result.snapshots && result.snapshots.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-current/20 ml-7"> {/* Indent snapshot section */}
                    <h3 className="font-semibold text-md mb-3">Snapshots:</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {result.snapshots.map((snapshot: Snapshot, index: number) => (
                        <div key={index} className="flex flex-col items-center border rounded-lg p-3 bg-background/50 dark:bg-muted/30 shadow-sm overflow-hidden">
                          {isValidImageDataUri(snapshot.dataUri) ? (
                             <Image
                              src={snapshot.dataUri}
                              alt={`Snapshot ${index + 1} at ${snapshot.timestamp.toFixed(2)}s`}
                              width={200} // Provide width
                              height={150} // Provide height
                              className="w-full h-auto max-h-48 object-contain rounded-md mb-2 border"
                              data-ai-hint="person identified snapshot" // Updated hint
                            />
                          ) : (
                              <div className="w-full h-48 flex flex-col items-center justify-center bg-muted rounded-md mb-2 border text-muted-foreground text-center p-2">
                                  <ImageIcon className="h-8 w-8 mb-1" />
                                  <span className="text-xs">Invalid or placeholder image data</span>
                              </div>
                          )}

                          <p className="text-sm text-muted-foreground mt-1 font-medium whitespace-nowrap">
                            Timestamp: {snapshot.timestamp.toFixed(2)}s
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                 {/* Show message if person identified but no valid snapshots */}
                {result.isPresent && (!result.snapshots || result.snapshots.length === 0 || !result.snapshots.some(s => isValidImageDataUri(s.dataUri))) && (
                     <div className="mt-6 pt-4 border-t border-current/20 ml-7">
                        <p className="text-sm text-muted-foreground italic">Snapshots could not be generated or are unavailable.</p>
                    </div>
                )}
              </Alert>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

    