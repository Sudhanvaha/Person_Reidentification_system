"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
// Import the flow output type WITHOUT snapshots initially
import type { ReIdentifyPersonOutput, ReIdentifyPersonInput, Snapshot, ReIdentifyPersonOutputWithSnapshots } from "@/ai/flows/re-identify-person";
import { reIdentifyPerson } from "@/ai/flows/re-identify-person";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, Upload, Video, Loader2, Image as ImageIcon, AlertCircle, Clock, ImageOff, Camera } from "lucide-react"; // Added Camera icon
import Image from "next/image";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress"; // Import Progress

// Placeholder data URI (simple gray square) - For fallback UI
const placeholderDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACgtt2+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABDSURBVDhPY2AYYAAGEgYGDAlQw/z//z/DwsKCMjIyAAAA///fVAGIYvj7+4eFhQUAAAAA///vrgQ0MDBgfHx8AADsHBFsXnVsmwAAAABJRU5ErkJggg==';


export default function Home() {
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [videoDataUri, setVideoDataUri] = useState<string | null>(null); // For sending to backend
  const [videoSrc, setVideoSrc] = useState<string | null>(null); // For <video> tag srcObject URL
  const [result, setResult] = useState<ReIdentifyPersonOutputWithSnapshots | null>(null); // Use the type with optional snapshots
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("Analyzing...");
  const [extractionProgress, setExtractionProgress] = useState<number>(0); // Progress for snapshot extraction
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null); // Ref for the video element
  const canvasRef = useRef<HTMLCanvasElement>(null); // Ref for drawing frames to canvas
  const { toast } = useToast();

  // Preload placeholder image
  useEffect(() => {
    const img = new window.Image();
    img.src = placeholderDataUri;
  }, []);

  // Effect to revoke object URLs when component unmounts or video file changes
  useEffect(() => {
    const currentVideoSrc = videoSrc;
    return () => {
      if (currentVideoSrc) {
        URL.revokeObjectURL(currentVideoSrc);
        console.log("Revoked video object URL");
      }
    };
  }, [videoSrc]);


  const onDropPhoto = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setPhotoDataUri(reader.result as string);
        setError(null);
        setResult(null);
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
      setVideoFile(file);
      setError(null);
      setResult(null);

      // Create Object URL for the <video> tag
      const objectUrl = URL.createObjectURL(file);
      setVideoSrc(objectUrl);
      console.log("Created video object URL:", objectUrl);


      // Read file as Data URI for sending to backend
      const reader = new FileReader();
      reader.onload = () => {
        setVideoDataUri(reader.result as string);
      };
       reader.onerror = () => {
         setError("Error reading video file for backend.");
         setVideoSrc(null); // Clear video source if reading fails
         URL.revokeObjectURL(objectUrl); // Revoke URL if reading fails
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
      'video/*': ['.mp4', '.mov', '.avi', '.wmv', '.webm', '.mkv'],
    },
     maxSize: 100 * 1024 * 1024, // Limit video size to 100MB
     onDropRejected: (rejectedFiles) => {
       const largeFile = rejectedFiles.find(f => f.errors.some(e => e.code === 'file-too-large'));
       if (largeFile) {
         setError("Video file is too large. Please upload a smaller video (under 100MB).");
         toast({ variant: "destructive", title: "File Too Large", description: "Video size exceeds the limit (100MB)." });
       } else {
           setError("Invalid video file type or other error.");
           toast({ variant: "destructive", title: "Invalid File", description: "Please upload a supported video format." });
       }
       setVideoFile(null);
       setVideoDataUri(null);
       setVideoSrc(null);
     }
  });

  // --- Client-Side Frame Extraction ---
  const extractFrame = (videoElement: HTMLVideoElement, timestamp: number): Promise<Snapshot> => {
      return new Promise((resolve) => {
          if (!canvasRef.current) {
              console.error("Canvas ref not available");
               resolve({ timestamp, dataUri: placeholderDataUri, generationStatus: 'failed' });
              return;
          }
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');

          if (!context) {
               console.error("Canvas context not available");
               resolve({ timestamp, dataUri: placeholderDataUri, generationStatus: 'failed' });
              return;
          }

          const seekEventHandler = () => {
              // Ensure video dimensions are set before drawing
              if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                  canvas.width = videoElement.videoWidth;
                  canvas.height = videoElement.videoHeight;
                  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                  try {
                      // Try JPEG first (more common, smaller size)
                      let dataUri = canvas.toDataURL('image/jpeg', 0.8); // Quality 0.8
                      // Fallback to PNG if JPEG is not supported or empty (shouldn't happen often)
                      if (!dataUri || dataUri === 'data:,') {
                          console.warn("Falling back to PNG for snapshot");
                          dataUri = canvas.toDataURL('image/png');
                      }
                       resolve({ timestamp, dataUri, generationStatus: 'extracted' });
                  } catch (e) {
                       console.error("Error generating data URL from canvas:", e);
                       resolve({ timestamp, dataUri: placeholderDataUri, generationStatus: 'failed' });
                  }
              } else {
                  console.warn("Video dimensions not available yet for drawing frame.");
                   // Retry drawing after a short delay if dimensions are not ready
                   setTimeout(() => {
                       if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                            canvas.width = videoElement.videoWidth;
                            canvas.height = videoElement.videoHeight;
                            context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                            try {
                                let dataUri = canvas.toDataURL('image/jpeg', 0.8);
                                if (!dataUri || dataUri === 'data:,') dataUri = canvas.toDataURL('image/png');
                                resolve({ timestamp, dataUri, generationStatus: 'extracted' });
                            } catch (e) {
                                 console.error("Error generating data URL from canvas (retry):", e);
                                 resolve({ timestamp, dataUri: placeholderDataUri, generationStatus: 'failed' });
                            }
                       } else {
                            console.error("Video dimensions still not available after delay.");
                            resolve({ timestamp, dataUri: placeholderDataUri, generationStatus: 'failed' });
                       }
                   }, 100); // Wait 100ms and try again
              }

              // Clean up the event listener *after* processing
              videoElement.removeEventListener('seeked', seekEventHandler);
          };

          // Add listener *before* setting currentTime
          videoElement.addEventListener('seeked', seekEventHandler, { once: true });

          // Set the time. The 'seeked' event will fire when ready.
          videoElement.currentTime = timestamp;

          // Timeout fallback in case 'seeked' event doesn't fire (e.g., invalid timestamp)
          setTimeout(() => {
               videoElement.removeEventListener('seeked', seekEventHandler);
               // Check if resolved already by the event handler
               resolve({ timestamp, dataUri: placeholderDataUri, generationStatus: 'failed' }); // Resolve with failure if timeout reached
               console.warn(`Timeout waiting for seeked event for timestamp ${timestamp}`);
           }, 2000); // 2 second timeout for seeking

      });
  };

   const extractSnapshots = async (timestamps: number[]): Promise<Snapshot[]> => {
        if (!videoRef.current || timestamps.length === 0) {
            return [];
        }
        setLoadingMessage("Extracting snapshots...");
        setExtractionProgress(0);
        const videoElement = videoRef.current;
        const snapshots: Snapshot[] = [];
        const totalSteps = timestamps.length;

        // Mute video to prevent audio playback during seeking
        const originalMuted = videoElement.muted;
        videoElement.muted = true;

        // Ensure video metadata is loaded before seeking
        if (videoElement.readyState < 1) { // HAVE_NOTHING or HAVE_METADATA
           await new Promise<void>(resolve => {
               const loadedMetaHandler = () => {
                   videoElement.removeEventListener('loadedmetadata', loadedMetaHandler);
                   resolve();
               };
               videoElement.addEventListener('loadedmetadata', loadedMetaHandler, { once: true });
                // Add timeout for metadata loading
               setTimeout(() => {
                   videoElement.removeEventListener('loadedmetadata', loadedMetaHandler);
                   console.warn("Timeout waiting for video metadata.");
                   resolve(); // Proceed anyway, might fail later
               }, 3000); // 3 second timeout
           });
        }


        for (let i = 0; i < timestamps.length; i++) {
            const timestamp = timestamps[i];
             console.log(`[Snapshot Extraction] Attempting frame at ${timestamp.toFixed(2)}s`);
            try {
                const snapshot = await extractFrame(videoElement, timestamp);
                snapshots.push(snapshot);
                console.log(`[Snapshot Extraction] ${snapshot.generationStatus === 'extracted' ? 'Success' : 'Failed'} for ${timestamp.toFixed(2)}s. URI Length: ${snapshot.dataUri.length}`);
            } catch (error) {
                 console.error(`[Snapshot Extraction] Error extracting frame at ${timestamp.toFixed(2)}s:`, error);
                 snapshots.push({ timestamp, dataUri: placeholderDataUri, generationStatus: 'failed' });
            }
             // Update progress
             setExtractionProgress(((i + 1) / totalSteps) * 100);
        }

        // Restore original muted state
        videoElement.muted = originalMuted;
        setExtractionProgress(0); // Reset progress
        return snapshots;
    };


  const handleReIdentify = async () => {
    if (!photoDataUri || !videoDataUri || !photoFile || !videoFile) {
      setError("Please upload both a photo and a video.");
      toast({ variant: "destructive", title: "Missing Files", description: "Please upload both a photo and a video." });
      return;
    }

    // Video file size check (client-side)
     if (videoFile.size > 100 * 1024 * 1024) { // 100MB limit check
         setError("Video file is too large (> 100MB). Processing might fail or be very slow.");
         toast({ variant: "destructive", title: "File Too Large", description: "Video size is very large. Consider using a shorter clip." });
     }

    setLoading(true);
    setLoadingMessage("Analyzing video...");
    setError(null);
    setResult(null);
    setExtractionProgress(0); // Reset progress
    console.log("Starting re-identification process...");

    try {
      const input: ReIdentifyPersonInput = { photoDataUri, videoDataUri };
      const llmResult: ReIdentifyPersonOutput = await reIdentifyPerson(input); // LLM result doesn't have snapshots yet
      console.log("Re-identification LLM result received:", llmResult);

      let finalResult: ReIdentifyPersonOutputWithSnapshots = { ...llmResult, snapshots: [] }; // Initialize with empty snapshots

      if (llmResult.isPresent && llmResult.timestamps && llmResult.timestamps.length > 0) {
        toast({ variant: "default", title: "Person Identified", description: "Extracting snapshot frames..." });
        // Extract snapshots client-side based on timestamps
        const extractedSnaps = await extractSnapshots(llmResult.timestamps);
        finalResult.snapshots = extractedSnaps; // Add extracted snapshots to the result

         // Toast based on extraction success
         const successfulSnaps = extractedSnaps.filter(s => s.generationStatus === 'extracted').length;
          if (successfulSnaps > 0) {
              toast({ variant: "success", title: "Snapshots Extracted", description: `${successfulSnaps} frame(s) successfully extracted.` });
          } else if (extractedSnaps.length > 0) {
               toast({ variant: "warning", title: "Snapshot Extraction Issues", description: "Could not extract visual snapshots." });
          }

      } else if (llmResult.isPresent) {
          // Person identified, but LLM provided no timestamps
          toast({ variant: "default", title: "Person Identified", description: "Location timestamps not provided by analysis." });
      } else {
          // Person not identified
          toast({ variant: "default", title: "Person Not Identified", description: llmResult.reason || "The person was not found in the video." });
      }

        // Handle cases where the LLM itself reported an error in the reason
        if (llmResult.reason?.toLowerCase().includes("error")) {
            toast({ variant: "destructive", title: "Processing Issue", description: llmResult.reason });
            setError(llmResult.reason);
        }


      setResult(finalResult);

    } catch (err: any) {
      console.error("Error during re-identification or extraction:", err);
      const errorMessage = `Processing failed: ${err.message || 'Unknown error'}`;
      setError(errorMessage);
      toast({ variant: "destructive", title: "Processing Error", description: errorMessage });
      setResult(null); // Ensure result is null on error
    } finally {
      setLoading(false);
      setLoadingMessage("Analyzing..."); // Reset message
      setExtractionProgress(0); // Reset progress
      console.log("Re-identification process finished.");
    }
  };

  // Function to check if a data URI looks like a valid image and is not the placeholder
  const isValidAndNotPlaceholder = (uri: string | null | undefined): boolean => {
    return !!uri && uri.startsWith('data:image/') && uri.length > 200 && uri !== placeholderDataUri; // Basic check + length + placeholder check
  };

  const getSnapshotBadgeVariant = (status?: Snapshot['generationStatus']): "success" | "destructive" | "secondary" | "warning" => {
      switch (status) {
          case 'extracted': return 'success'; // Changed from default to success
          case 'failed': return 'destructive'; // Red
          case 'placeholder': return 'secondary'; // Gray
          default: return 'warning'; // Use warning for unknown/undefined
      }
  }
   const getSnapshotStatusText = (status?: Snapshot['generationStatus']): string => {
      switch (status) {
          case 'extracted': return 'Extracted';
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

        {/* Hidden Canvas for frame extraction */}
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        {/* Hidden Video element for frame extraction */}
        {videoSrc && (
           <video ref={videoRef} src={videoSrc} muted playsInline style={{ display: 'none' }} crossOrigin="anonymous"></video>
        )}


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
                className={`flex items-center justify-center w-full h-60 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors ${isPhotoDragActive ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'} relative overflow-hidden`}
                 aria-label="Photo upload area"
              >
                <input {...getPhotoInputProps()} id="photo-upload" />
                 <label htmlFor="photo-upload" className="flex flex-col items-center justify-center text-center p-4 w-full h-full cursor-pointer z-10"> {/* Added cursor-pointer, z-index */}
                  {photoDataUri ? (
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
                 className={`flex items-center justify-center w-full h-60 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors ${isVideoDragActive ? 'border-primary bg-primary/10' : 'border-border bg-muted/20'} relative overflow-hidden`}
                 aria-label="Video upload area"
              >
                <input {...getVideoInputProps()} id="video-upload" />
                 <label htmlFor="video-upload" className="flex flex-col items-center justify-center text-center p-4 w-full h-full cursor-pointer z-10">
                   {videoSrc ? ( // Check videoSrc for preview instead of videoDataUri
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
                       <span className="text-xs text-muted-foreground/80 mt-1">MP4, MOV, WEBM, etc. (&lt;100MB)</span>
                    </>
                  )}
                </label>
                {!videoSrc && <Video className="absolute w-24 h-24 text-muted/20 opacity-50 z-0" />}
              </div>
            </CardContent>
          </Card>
        </div>

         {error && (
           <Alert variant="destructive" className="w-full max-w-4xl mb-6 shadow-md">
              <AlertCircle className="h-4 w-4" />
             <AlertTitle>Error</AlertTitle>
             <AlertDescription>{error}</AlertDescription>
           </Alert>
         )}

        <Button
          onClick={handleReIdentify}
          disabled={loading || !photoDataUri || !videoDataUri || !videoFile} // Ensure videoFile exists
          size="lg"
          className="px-10 py-6 text-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-shadow"
        >
          {loading ? (
            <>
              <Loader2 className="mr-3 h-6 w-6 animate-spin" /> {loadingMessage}
               {extractionProgress > 0 && (
                  <Progress value={extractionProgress} className="w-24 h-2 ml-4 bg-primary/30" indicatorClassName="bg-primary-foreground" />
               )}
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
              <Alert variant={result.isPresent ? "success" : "destructive"} className={`mb-6 border-l-4 ${result.isPresent ? 'border-green-500 bg-green-50/30 dark:bg-green-900/20' : 'border-destructive bg-destructive/10'}`}>
                 <div className="flex items-start">
                   {result.isPresent ? (
                     <CheckCircle className="h-6 w-6 mr-3 text-green-600 dark:text-green-500 flex-shrink-0 mt-1" />
                   ) : (
                     <XCircle className="h-6 w-6 mr-3 text-destructive flex-shrink-0 mt-1" />
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
                       {result.isPresent && result.timestamps && result.timestamps.length > 0 && (
                           <p className="text-sm text-muted-foreground mt-2">
                               Detected at timestamps: {result.timestamps.map(t => t.toFixed(1) + 's').join(', ')}
                           </p>
                       )}
                    </div>
                 </div>
                </Alert>


              {/* Snapshots Section */}
                {result.isPresent && result.snapshots && result.snapshots.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-border/50">
                    <h3 className="font-semibold text-lg mb-4 text-center flex items-center justify-center gap-2">
                        <Camera className="w-5 h-5" /> Extracted Snapshots
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {result.snapshots.map((snapshot: Snapshot, index: number) => (
                        <Card key={index} className="flex flex-col items-center border rounded-lg p-3 bg-background/70 dark:bg-muted/40 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
                          <div className="w-full h-48 mb-3 relative bg-muted rounded-md border flex items-center justify-center overflow-hidden">
                            {isValidAndNotPlaceholder(snapshot.dataUri) ? (
                                <Image
                                  src={snapshot.dataUri}
                                  alt={`Extracted Snapshot at ${snapshot.timestamp.toFixed(1)}s`}
                                  layout="fill"
                                  objectFit="contain"
                                  className="transition-transform duration-300 ease-in-out hover:scale-105"
                                  data-ai-hint="person identified snapshot"
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center text-muted-foreground text-center p-2">
                                    <ImageOff className="h-10 w-10 mb-2 text-destructive/50" />
                                    <span className="text-xs font-medium">{snapshot.generationStatus === 'failed' ? 'Extraction Failed' : 'Placeholder'}</span>
                                    <span className="text-xs">Could not extract frame</span>
                                </div>
                            )}
                          </div>

                           <div className="flex items-center justify-between w-full text-sm text-muted-foreground mt-1 px-1">
                                <span className="flex items-center gap-1 font-medium">
                                     <Clock className="w-3.5 h-3.5" />
                                     {snapshot.timestamp.toFixed(2)}s
                                </span>
                                <Badge variant={getSnapshotBadgeVariant(snapshot.generationStatus)} className="text-xs px-1.5 py-0.5">
                                  {getSnapshotStatusText(snapshot.generationStatus)}
                                </Badge>
                           </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                 {/* Message if person identified but no snapshots could be extracted/shown */}
                 {result.isPresent && (!result.snapshots || result.snapshots.length === 0) && (
                     <div className="mt-6 pt-6 border-t border-border/50 text-center">
                        <p className="text-base text-muted-foreground italic">Person identified, but visual snapshots could not be extracted (or no timestamps were provided).</p>
                    </div>
                )}

            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
