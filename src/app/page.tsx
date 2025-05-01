
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
// Import types including BoundingBox and updated output types
import type { ReIdentifyPersonOutput, ReIdentifyPersonInput, Snapshot, ReIdentifyPersonOutputWithSnapshots, IdentificationResult, BoundingBox } from "@/ai/flows/re-identify-person";
import { reIdentifyPerson } from "@/ai/flows/re-identify-person";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, Upload, Video, Loader2, Image as ImageIcon, AlertCircle, Clock, ImageOff, Camera, Film, Square, ArrowDown } from "lucide-react";
import Image from "next/image";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

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
  const snapshotImageRefs = useRef<{[key: number]: HTMLImageElement | null}>({}); // Refs for snapshot images to get dimensions
  const snapshotCanvasRefs = useRef<{[key: number]: HTMLCanvasElement | null}>({}); // Refs for snapshot canvases

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
  // Modified to accept an optional bounding box to associate with the snapshot
  const extractFrame = (videoElement: HTMLVideoElement, identification: IdentificationResult): Promise<Snapshot> => {
      return new Promise((resolve) => {
          const timestamp = identification.timestamp;
          const boundingBox = identification.boundingBox; // Get the bounding box for this timestamp

          if (!canvasRef.current) {
              console.error("Canvas ref not available");
               resolve({ timestamp, boundingBox, dataUri: placeholderDataUri, generationStatus: 'failed' });
              return;
          }
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');

          if (!context) {
               console.error("Canvas context not available");
               resolve({ timestamp, boundingBox, dataUri: placeholderDataUri, generationStatus: 'failed' });
              return;
          }

          // Flag to ensure resolve is called only once
          let resolved = false;

          const seekEventHandler = () => {
              if (resolved) return; // Prevent multiple resolves

              // Ensure video dimensions are set before drawing
              if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                  canvas.width = videoElement.videoWidth;
                  canvas.height = videoElement.videoHeight;
                  // Draw black background first to handle potential alpha channels in video
                  context.fillStyle = 'black';
                  context.fillRect(0, 0, canvas.width, canvas.height);
                  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                  try {
                      // Try JPEG first (more common, smaller size)
                      let dataUri = canvas.toDataURL('image/jpeg', 0.8); // Quality 0.8
                      // Fallback to PNG if JPEG is not supported or empty (shouldn't happen often)
                      if (!dataUri || dataUri === 'data:,') {
                          console.warn("Falling back to PNG for snapshot");
                          dataUri = canvas.toDataURL('image/png');
                      }
                       if (!resolved) {
                           resolved = true;
                           // Include the boundingBox in the resolved snapshot object
                           resolve({ timestamp, boundingBox, dataUri, generationStatus: 'extracted' });
                       }
                  } catch (e) {
                       console.error("Error generating data URL from canvas:", e);
                       if (!resolved) {
                            resolved = true;
                            resolve({ timestamp, boundingBox, dataUri: placeholderDataUri, generationStatus: 'failed' });
                       }
                  }
              } else {
                  console.warn("Video dimensions not available yet for drawing frame at", timestamp);
                   // Retry drawing after a short delay if dimensions are not ready
                   setTimeout(() => {
                       if (resolved) return;
                       if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
                            canvas.width = videoElement.videoWidth;
                            canvas.height = videoElement.videoHeight;
                            context.fillStyle = 'black';
                            context.fillRect(0, 0, canvas.width, canvas.height);
                            context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                            try {
                                let dataUri = canvas.toDataURL('image/jpeg', 0.8);
                                if (!dataUri || dataUri === 'data:,') dataUri = canvas.toDataURL('image/png');
                                if (!resolved) {
                                    resolved = true;
                                    resolve({ timestamp, boundingBox, dataUri, generationStatus: 'extracted' });
                                }
                            } catch (e) {
                                 console.error("Error generating data URL from canvas (retry):", e);
                                 if (!resolved) {
                                     resolved = true;
                                     resolve({ timestamp, boundingBox, dataUri: placeholderDataUri, generationStatus: 'failed' });
                                 }
                            }
                       } else {
                            console.error("Video dimensions still not available after delay for timestamp", timestamp);
                            if (!resolved) {
                                resolved = true;
                                resolve({ timestamp, boundingBox, dataUri: placeholderDataUri, generationStatus: 'failed' });
                            }
                       }
                   }, 150); // Wait 150ms and try again
              }

              // Clean up the event listener *after* processing
              // No need to remove if { once: true } is used
              // videoElement.removeEventListener('seeked', seekEventHandler);
          };

          const errorHandler = (event: Event) => {
              if (resolved) return;
              console.error(`Video seeking error for timestamp ${timestamp}:`, event);
              resolved = true;
              resolve({ timestamp, boundingBox, dataUri: placeholderDataUri, generationStatus: 'failed' });
          };

          // Add listener *before* setting currentTime
          // Use 'seeked' for success, 'error' for potential issues during seek
          videoElement.addEventListener('seeked', seekEventHandler, { once: true });
          videoElement.addEventListener('error', errorHandler, { once: true });


          // Set the time. The 'seeked' event will fire when ready.
          videoElement.currentTime = timestamp;

          // Timeout fallback in case 'seeked' event doesn't fire (e.g., invalid timestamp, browser issues)
          setTimeout(() => {
               if (resolved) return; // Already resolved by seeked or error handler
               videoElement.removeEventListener('seeked', seekEventHandler);
               videoElement.removeEventListener('error', errorHandler);
               resolved = true;
               resolve({ timestamp, boundingBox, dataUri: placeholderDataUri, generationStatus: 'failed' }); // Resolve with failure if timeout reached
               console.warn(`Timeout waiting for seeked/error event for timestamp ${timestamp}`);
           }, 3000); // 3 second timeout for seeking

      });
  };

   // Modified to accept IdentificationResult array (timestamp + optional box)
   const extractSnapshots = async (identifications: IdentificationResult[]): Promise<Snapshot[]> => {
        if (!videoRef.current || identifications.length === 0) {
            return [];
        }
        setLoadingMessage(`Extracting ${identifications.length} snapshot${identifications.length > 1 ? 's' : ''}...`);
        setExtractionProgress(0);
        const videoElement = videoRef.current;
        const snapshots: Snapshot[] = [];
        const totalSteps = identifications.length;

        // Mute video to prevent audio playback during seeking
        const originalMuted = videoElement.muted;
        videoElement.muted = true;
        // Ensure playback doesn't start if paused
        const originalPaused = videoElement.paused;
        if (!originalPaused) videoElement.pause();


        // Ensure video metadata is loaded before seeking
        if (videoElement.readyState < videoElement.HAVE_METADATA) { // HAVE_METADATA = 1
           console.log("Waiting for video metadata...");
           await new Promise<void>((resolve, reject) => {
               const loadedMetaHandler = () => {
                   videoElement.removeEventListener('loadedmetadata', loadedMetaHandler);
                   videoElement.removeEventListener('error', errorHandler);
                   console.log("Video metadata loaded.");
                   resolve();
               };
                const errorHandler = (e: Event) => {
                   videoElement.removeEventListener('loadedmetadata', loadedMetaHandler);
                   videoElement.removeEventListener('error', errorHandler);
                   console.error("Error loading video metadata:", e);
                   reject(new Error("Failed to load video metadata"));
               };

               videoElement.addEventListener('loadedmetadata', loadedMetaHandler, { once: true });
               videoElement.addEventListener('error', errorHandler, { once: true });

               // Timeout for metadata loading
               setTimeout(() => {
                   videoElement.removeEventListener('loadedmetadata', loadedMetaHandler);
                   videoElement.removeEventListener('error', errorHandler);
                   if (videoElement.readyState < videoElement.HAVE_METADATA) {
                       console.warn("Timeout waiting for video metadata.");
                       reject(new Error("Timeout waiting for video metadata"));
                   } else {
                       resolve(); // Metadata might have loaded just before timeout check
                   }
               }, 5000); // 5 second timeout
           }).catch(err => {
               console.error("Snapshot extraction aborted due to metadata error:", err);
               // Restore original state
               videoElement.muted = originalMuted;
               if (!originalPaused) videoElement.play();
               setLoadingMessage("Analysis Failed");
               setExtractionProgress(0);
               toast({ variant: "destructive", title: "Snapshot Error", description: "Could not load video metadata for extraction." });
               return []; // Return empty array if metadata fails
           });
        }

        // Ensure video is seekable (readyState > HAVE_CURRENT_DATA usually means it is)
        if (videoElement.readyState < videoElement.HAVE_CURRENT_DATA) { // HAVE_CURRENT_DATA = 2
           console.log("Video not seekable yet, waiting...");
            await new Promise<void>(resolve => {
               const canPlayHandler = () => {
                   videoElement.removeEventListener('canplay', canPlayHandler);
                   console.log("Video is now seekable.");
                   resolve();
               };
               videoElement.addEventListener('canplay', canPlayHandler, { once: true });
                setTimeout(() => {
                   videoElement.removeEventListener('canplay', canPlayHandler);
                   console.warn("Timeout waiting for video to become seekable.");
                   resolve(); // Proceed anyway, might fail later
               }, 5000); // 5 second timeout
           });
        }


        for (let i = 0; i < identifications.length; i++) {
            const identification = identifications[i]; // Use the full identification object
            const timestamp = identification.timestamp; // Get timestamp from it
            console.log(`[Snapshot Extraction] Attempting frame at ${timestamp.toFixed(2)}s`);
            try {
                // Pass the entire identification object (including potential bounding box)
                const snapshot = await extractFrame(videoElement, identification);
                snapshots.push(snapshot);
                console.log(`[Snapshot Extraction] ${snapshot.generationStatus === 'extracted' ? 'Success' : 'Failed'} for ${timestamp.toFixed(2)}s. Box: ${snapshot.boundingBox ? 'Yes' : 'No'}. URI Length: ${snapshot.dataUri.length}`);
            } catch (error) {
                 console.error(`[Snapshot Extraction] Error extracting frame at ${timestamp.toFixed(2)}s:`, error);
                 // Include timestamp and potentially null bounding box in failed snapshot
                 snapshots.push({ timestamp, boundingBox: identification.boundingBox, dataUri: placeholderDataUri, generationStatus: 'failed' });
            }
             // Update progress
             setExtractionProgress(((i + 1) / totalSteps) * 100);
        }

        // Restore original state
        videoElement.muted = originalMuted;
        if (!originalPaused) videoElement.play(); // Resume playback if it was playing

        setExtractionProgress(0); // Reset progress
        setLoadingMessage("Analysis Complete"); // Update message after extraction
        console.log(`[Snapshot Extraction] Finished. Extracted ${snapshots.filter(s => s.generationStatus === 'extracted').length} of ${identifications.length} frames.`);
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
         toast({ variant: "warning", title: "File Too Large", description: "Video size is large (>100MB). Analysis might take longer or fail." });
         // Don't return, let the backend handle if it can, but warn the user.
     }

    setLoading(true);
    setLoadingMessage("Analyzing video...");
    setError(null);
    setResult(null);
    setExtractionProgress(0); // Reset progress
    console.log("Starting re-identification process...");

    try {
      const input: ReIdentifyPersonInput = { photoDataUri, videoDataUri };
      const llmResult: ReIdentifyPersonOutput = await reIdentifyPerson(input); // LLM result now includes identifications
      console.log("Re-identification LLM result received:", llmResult);

      // Prepare the final result structure, keeping identifications from LLM
      let finalResult: ReIdentifyPersonOutputWithSnapshots = {
          isPresent: llmResult.isPresent,
          confidence: llmResult.confidence,
          reason: llmResult.reason,
          identifications: llmResult.identifications, // Keep the original identifications
          snapshots: [], // Initialize snapshots as empty
      };

      // Extract snapshots IF identifications are available AND the person is identified as present.
      if (llmResult.isPresent && llmResult.identifications && llmResult.identifications.length > 0) {
        toast({ variant: "default", title: "Analysis Complete", description: "Extracting snapshot frames..." });
        // Extract snapshots client-side based on the full identifications array (timestamp + box)
        const extractedSnaps = await extractSnapshots(llmResult.identifications);
        finalResult.snapshots = extractedSnaps; // Add extracted snapshots (which now include boundingBox) to the result

         // Toast based on extraction success
         const successfulSnaps = extractedSnaps.filter(s => s.generationStatus === 'extracted').length;
          if (successfulSnaps > 0) {
              toast({ variant: "success", title: "Snapshots Extracted", description: `${successfulSnaps} frame(s) successfully extracted.` });
          } else if (extractedSnaps.length > 0) {
               toast({ variant: "warning", title: "Snapshot Extraction Issues", description: "Could not extract any visual snapshots." });
          } else {
              // This case means identifications were provided but extraction failed completely.
              toast({ variant: "warning", title: "Snapshots", description: "Snapshots could not be extracted from the identified timestamps." });
          }

      } else if (llmResult.isPresent) {
          // Person identified, but LLM provided no identifications (timestamps/boxes)
          toast({ variant: "default", title: "Person Identified", description: "Location data not provided by analysis." });
      } else {
          // Person not identified (and therefore no identifications to extract from)
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
    // Increased length check as placeholder is small but valid base64
    return !!uri && uri.startsWith('data:image/') && uri.length > 300 && uri !== placeholderDataUri;
  };

  const getSnapshotBadgeVariant = (status?: Snapshot['generationStatus']): "success" | "destructive" | "secondary" | "warning" => {
      switch (status) {
          case 'extracted': return 'success';
          case 'failed': return 'destructive';
          case 'placeholder': return 'secondary';
          default: return 'warning'; // Use warning for 'unknown' or undefined
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

  // Helper to draw arrow on canvas
  const drawArrowOnCanvas = (canvas: HTMLCanvasElement, box: BoundingBox, imageElement?: HTMLImageElement | null) => {
    const context = canvas.getContext('2d');

    // Determine the effective dimensions to use for scaling coordinates
    let effectiveWidth = canvas.width;
    let effectiveHeight = canvas.height;

    // If image dimensions are available and the image uses 'contain', calculate the scaled dimensions
    if (imageElement && imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0) {
        const imgAspect = imageElement.naturalWidth / imageElement.naturalHeight;
        const canvasAspect = canvas.width / canvas.height;

        if (imgAspect > canvasAspect) { // Image is wider than canvas aspect ratio
            effectiveWidth = canvas.width;
            effectiveHeight = canvas.width / imgAspect;
        } else { // Image is taller or same aspect ratio
            effectiveHeight = canvas.height;
            effectiveWidth = canvas.height * imgAspect;
        }
    }
     // Calculate offsets for 'contain' positioning (center the scaled image)
    const offsetX = (canvas.width - effectiveWidth) / 2;
    const offsetY = (canvas.height - effectiveHeight) / 2;


    if (!context || !effectiveWidth || !effectiveHeight || effectiveWidth <=0 || effectiveHeight <= 0) { // Check effective dimensions are positive
        console.warn("Canvas context or effective dimensions not ready or invalid for drawing arrow.");
        return;
    }

    // Clear previous drawings if reusing canvas
    context.clearRect(0, 0, canvas.width, canvas.height);

    // --- Arrow Calculation ---
    // Target point: Aim towards the estimated upper chest/neck area, slightly below the top-center of the box.
    // This is a heuristic assuming a typical upper body pose.
    const targetX = offsetX + ((box.xMin + box.xMax) / 2) * effectiveWidth;
    // Target a point roughly 1/4 down the height of the bounding box.
    const targetY = offsetY + (box.yMin + (box.yMax - box.yMin) * 0.25) * effectiveHeight;

    // Arrow length relative to effective height, with min/max
    const arrowLength = Math.max(20, Math.min(effectiveHeight * 0.15, 40)); // Slightly longer arrow
    const headLength = Math.min(arrowLength * 0.4, 12); // Arrow head size relative to length

    // Start point: Positioned *above* the target point
    const arrowStartY = Math.max(offsetY, targetY - arrowLength); // Start arrow above the target Y, ensuring it's within image bounds if possible

    // End point (arrow tip): Exactly at the target point
    const arrowTipX = targetX;
    const arrowTipY = targetY;

    // --- Drawing ---
    context.beginPath();
    context.moveTo(arrowTipX, arrowStartY); // Start line above target
    context.lineTo(arrowTipX, arrowTipY); // Draw line down to the target point

    // Arrowhead points down (towards targetY)
    context.moveTo(arrowTipX, arrowTipY); // Move to tip
    context.lineTo(arrowTipX - headLength / 2, arrowTipY - headLength * 0.8); // Point left-up from the tip (adjust angle)
    context.moveTo(arrowTipX, arrowTipY); // Move back to tip
    context.lineTo(arrowTipX + headLength / 2, arrowTipY - headLength * 0.8); // Point right-up from the tip (adjust angle)

    context.strokeStyle = 'rgba(255, 0, 0, 0.9)'; // Semi-transparent Red arrow color
    context.lineWidth = 3; // Thicker arrow line
    context.lineCap = 'round'; // Rounded line ends
    context.stroke();
    console.log(`Drew arrow from (${arrowTipX.toFixed(0)}, ${arrowStartY.toFixed(0)}) -> (${arrowTipX.toFixed(0)}, ${arrowTipY.toFixed(0)}) targeting estimated upper body.`);
  };


  // Use effect to redraw arrows when image dimensions are loaded or result changes
  useEffect(() => {
      if (result?.snapshots) {
          result.snapshots.forEach((snapshot, index) => {
              if (snapshot.boundingBox) {
                  const canvas = snapshotCanvasRefs.current[index];
                  const image = snapshotImageRefs.current[index];

                  const redrawArrow = () => {
                       if (canvas && snapshot.boundingBox && image && image.naturalWidth > 0 && image.naturalHeight > 0) {
                          // Ensure canvas has the same aspect ratio as the image for correct scaling
                          const imgAspect = image.naturalWidth / image.naturalHeight;
                           // Use container dimensions as a reference for canvas size
                          const container = canvas.parentElement;
                           if (container) {
                                const containerWidth = container.offsetWidth;
                                const containerHeight = container.offsetHeight;

                                // Calculate canvas dimensions to fit container while maintaining image aspect ratio
                                let canvasWidth, canvasHeight;
                                if (containerWidth / containerHeight > imgAspect) {
                                    // Container is wider than image
                                    canvasHeight = containerHeight;
                                    canvasWidth = containerHeight * imgAspect;
                                } else {
                                    // Container is taller or same aspect ratio
                                    canvasWidth = containerWidth;
                                    canvasHeight = containerWidth / imgAspect;
                                }
                                // Set canvas intrinsic size
                                canvas.width = canvasWidth;
                                canvas.height = canvasHeight;
                                 // Style canvas to fit container (redundant if using fill but good practice)
                                canvas.style.width = `${canvasWidth}px`;
                                canvas.style.height = `${canvasHeight}px`;

                                drawArrowOnCanvas(canvas, snapshot.boundingBox, image);
                            } else {
                                 console.warn("Canvas parent container not found for sizing.");
                                // Fallback to image natural size? Might be too large.
                                // canvas.width = image.naturalWidth;
                                // canvas.height = image.naturalHeight;
                                // drawArrowOnCanvas(canvas, snapshot.boundingBox, image);
                            }
                          } else {
                              console.warn(`Skipping arrow draw for index ${index}: canvas or image refs missing, or image not loaded.`);
                          }
                  };

                  if (canvas && image) {
                       if (image.complete && image.naturalWidth > 0) { // Check if image is already loaded and has dimensions
                           redrawArrow();
                       } else {
                           // Image not loaded yet, add event listener
                           const handleLoad = () => {
                               redrawArrow();
                               image.removeEventListener('load', handleLoad); // Clean up listener
                               console.log(`Image ${index} loaded, drawing arrow.`);
                           };
                           const handleError = () => {
                               console.error(`Image ${index} failed to load.`);
                               image.removeEventListener('load', handleLoad);
                               image.removeEventListener('error', handleError);
                           }
                           image.addEventListener('load', handleLoad);
                           image.addEventListener('error', handleError);
                           // If the image might already be loaded but event missed (cache?)
                           if (image.complete && image.naturalWidth > 0) {
                                handleLoad(); // Try drawing immediately if complete
                           }
                       }
                  }
              } else {
                 // If no bounding box, ensure the canvas is clear
                 const canvas = snapshotCanvasRefs.current[index];
                 if (canvas) {
                    const context = canvas.getContext('2d');
                    if (context) {
                        context.clearRect(0, 0, canvas.width, canvas.height);
                    }
                 }
              }
          });
      }
  }, [result?.snapshots]); // Re-run when snapshots change


  return (
    <>
     <Toaster /> {/* Add Toaster component here */}
      <div className="container mx-auto flex flex-col items-center justify-center min-h-screen py-8 px-4">
        <h1 className="text-4xl font-bold mb-8 text-center text-primary">Person Re-Identification</h1>
        <p className="text-muted-foreground mb-6 text-center max-w-2xl">Upload a clear photo of a person and a video (MP4, MOV, WEBM, etc., ideally under 100MB and less than a minute long) to see if the person appears in the video.</p>

        {/* Hidden Canvas for frame extraction */}
        <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
        {/* Hidden Video element for frame extraction - Needs to be potentially visible for debugging */}
         {videoSrc && (
           <video
              ref={videoRef}
              src={videoSrc}
              muted
              playsInline
              // controls // Add controls for debugging seeking issues if needed
              style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '1px', height: '1px' }} // Keep offscreen but allow browser to load/process
              // style={{ display: 'none' }} // Original - hide completely
              crossOrigin="anonymous"
              preload="auto" // Encourage browser to load metadata and some data
              onLoadedMetadata={() => console.log("Debug: Video metadata loaded")}
              onError={(e) => console.error("Debug: Video element error", e)}
           ></video>
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
                       <Image src={photoDataUri} alt="Uploaded Person Preview" width={150} height={150} className="max-h-40 w-auto rounded-md object-contain border bg-white shadow-sm mb-2" data-ai-hint="person lookup photo"/>
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
                      <Film className="h-10 w-10 text-primary mb-2" /> {/* Changed icon */}
                      <span className="text-sm text-foreground font-medium">Video Selected</span>
                       {videoFile && <span className="text-xs text-muted-foreground/90 mt-1">{videoFile.name} ({(videoFile.size / (1024*1024)).toFixed(1)} MB)</span>}
                      <span className="text-xs text-muted-foreground mt-1">(Click or drag to replace)</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-10 w-10 text-muted-foreground mb-2" /> {/* Changed icon back to Upload */}
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
              <Alert variant={result.isPresent ? "success" : "default"} className={`mb-6 border-l-4 ${result.isPresent ? 'border-green-500 bg-green-50/30 dark:bg-green-900/20' : 'border-border bg-background/50 dark:bg-muted/20'}`}>
                 <div className="flex items-start">
                   {result.isPresent ? (
                     <CheckCircle className="h-6 w-6 mr-3 text-green-600 dark:text-green-500 flex-shrink-0 mt-1" />
                   ) : (
                     <XCircle className="h-6 w-6 mr-3 text-muted-foreground flex-shrink-0 mt-1" /> // Use muted XCircle if not present
                   )}
                   <div className="flex-grow">
                      <AlertTitle className="font-semibold text-xl mb-1">
                        {result.isPresent ? "Person Identified" : "Person Not Identified"}
                      </AlertTitle>
                      <AlertDescription className="text-base">
                         {result.reason || (result.isPresent ? "The person appears to be present in the video." : "The person does not appear to be present in the video.")}
                         {result.confidence !== undefined && result.confidence !== null && (
                             <Badge variant={result.isPresent ? "success" : "secondary"} className="ml-2">Confidence: {result.confidence.toFixed(2)}</Badge>
                         )}
                      </AlertDescription>
                       {/* Display timestamps from the 'identifications' array */}
                       {result.isPresent && result.identifications && result.identifications.length > 0 && (
                           <p className="text-sm text-muted-foreground mt-2">
                               Potential match timestamps: {result.identifications.map(id => id.timestamp.toFixed(1) + 's').join(', ')}
                           </p>
                       )}
                    </div>
                 </div>
                </Alert>


              {/* Snapshots Section - Show if snapshots array exists and has items AND person was identified */}
                {result.isPresent && result.snapshots && result.snapshots.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-border/50">
                    <h3 className="font-semibold text-lg mb-4 text-center flex items-center justify-center gap-2">
                        <Camera className="w-5 h-5" /> Extracted Snapshots
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {result.snapshots.map((snapshot: Snapshot, index: number) => (
                        <Card key={index} className="flex flex-col items-center border rounded-lg p-3 bg-background/70 dark:bg-muted/40 shadow-sm overflow-hidden transition-shadow hover:shadow-md">
                          {/* Container for Image and Arrow Canvas */}
                           {/* Set explicit size for the container to match image aspect ratio */}
                           <div className="w-full aspect-video mb-3 relative bg-muted/50 dark:bg-muted/30 rounded-md border flex items-center justify-center overflow-hidden">
                            {isValidAndNotPlaceholder(snapshot.dataUri) ? (
                              <>
                                <Image
                                  ref={el => snapshotImageRefs.current[index] = el} // Store image ref
                                  src={snapshot.dataUri}
                                  alt={`Extracted Snapshot at ${snapshot.timestamp.toFixed(1)}s`}
                                  fill // Use fill layout
                                  style={{ objectFit: 'contain' }} // Use style for object-fit with fill
                                  className="transition-transform duration-300 ease-in-out hover:scale-105"
                                  data-ai-hint="person identified snapshot"
                                  unoptimized // Add if base64 strings cause issues with Next/Image optimization
                                />
                                {/* Render Arrow using Canvas if bounding box is available */}
                                {snapshot.boundingBox && (
                                  <canvas
                                     ref={el => snapshotCanvasRefs.current[index] = el} // Store canvas ref
                                    // Intrinsic size will be set in useEffect based on container/image aspect ratio
                                     style={{
                                      position: 'absolute',
                                      left: '50%', // Center horizontally
                                      top: '50%', // Center vertically
                                      transform: 'translate(-50%, -50%)', // Fine-tune centering
                                      maxWidth: '100%', // Ensure canvas doesn't overflow container width
                                      maxHeight: '100%', // Ensure canvas doesn't overflow container height
                                      pointerEvents: 'none', // Allow clicks through the canvas
                                    }}
                                  />
                                )}
                               </>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-muted-foreground text-center p-2">
                                    <ImageOff className="h-10 w-10 mb-2 text-destructive/50" />
                                    <span className="text-xs font-medium">{snapshot.generationStatus === 'failed' ? 'Extraction Failed' : 'Placeholder'}</span>
                                     {snapshot.generationStatus === 'failed' && <span className="text-xs">Could not extract frame</span>}
                                </div>
                            )}
                          </div>

                           <div className="flex items-center justify-between w-full text-sm text-muted-foreground mt-1 px-1">
                                <span className="flex items-center gap-1 font-medium">
                                     <Clock className="w-3.5 h-3.5" />
                                     {snapshot.timestamp.toFixed(2)}s
                                </span>
                                 {/* Indicate if localization data (box/arrow) is present */}
                                 <span className={`flex items-center gap-1 ${snapshot.boundingBox ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground/60'}`}>
                                      {snapshot.boundingBox ? <ArrowDown className="w-3 h-3" /> : <Square className="w-3 h-3 opacity-50" />}
                                      <span className="text-xs">{snapshot.boundingBox ? 'Located' : 'No Loc'}</span>
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

                 {/* Message if person was identified but no identifications/snapshots resulted */}
                 {result.isPresent && (!result.snapshots || result.snapshots.length === 0) && (!result.identifications || result.identifications.length === 0) && (
                     <div className="mt-6 pt-6 border-t border-border/50 text-center">
                        <p className="text-base text-muted-foreground italic">Person was identified, but no specific location data or snapshots could be extracted.</p>
                    </div>
                )}
                 {/* Message if person was identified, identifications found but extraction failed for all */}
                 {result.isPresent && result.identifications && result.identifications.length > 0 && (!result.snapshots || result.snapshots.length === 0) && (
                    <div className="mt-6 pt-6 border-t border-border/50 text-center">
                        <p className="text-base text-muted-foreground italic">Person was identified at specific timestamps, but visual snapshots could not be extracted.</p>
                    </div>
                 )}


            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

