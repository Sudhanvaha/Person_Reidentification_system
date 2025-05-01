"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import type { ReIdentifyPersonOutput, ReIdentifyPersonInput, Snapshot } from "@/ai/flows/re-identify-person";
import { reIdentifyPerson } from "@/ai/flows/re-identify-person";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, Upload, Video, Loader2 } from "lucide-react";

export default function Home() {
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [videoDataUri, setVideoDataUri] = useState<string | null>(null);
  const [result, setResult] = useState<ReIdentifyPersonOutput | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
      }
      reader.readAsDataURL(file);
    }
  }, []);

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
      }
      reader.readAsDataURL(file);
    }
  }, []);

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
    } catch (err: any) {
      console.error("Error during re-identification:", err);
      setError(`Error during processing: ${err.message || 'Unknown error'}`);
      setResult(null); // Ensure result is null on error
    } finally {
      setLoading(false);
    }
  };

  return (
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
              <input {...getPhotoInputProps()} id="photo-upload" />
              <label htmlFor="photo-upload" className="flex flex-col items-center justify-center text-center p-4 w-full h-full">
                {photoDataUri ? (
                  <img src={photoDataUri} alt="Uploaded Person" className="max-h-36 max-w-full rounded-md object-contain" />
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
              <input {...getVideoInputProps()} id="video-upload" />
              <label htmlFor="video-upload" className="flex flex-col items-center justify-center text-center p-4 w-full h-full">
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
             {videoDataUri && (
                <video src={videoDataUri} className="mt-4 max-h-24 max-w-full rounded-md mx-auto block" controls />
              )}
          </CardContent>
        </Card>
      </div>

       {error && (
         <Alert variant="destructive" className="w-full max-w-4xl mb-6">
            <XCircle className="h-4 w-4" />
           <AlertTitle>Error</AlertTitle>
           <AlertDescription>{error}</AlertDescription>
         </Alert>
       )}

      <Button
        onClick={handleReIdentify}
        disabled={loading || !photoDataUri || !videoDataUri}
        className="px-8 py-3 text-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
            <Alert variant={result.isPresent ? "default" : "destructive"} className={result.isPresent ? "border-green-500 bg-green-50 text-green-900 [&>svg]:text-green-600" : ""}>
              {result.isPresent ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
              <AlertTitle className="font-semibold text-lg">
                {result.isPresent ? "Person Identified" : "Person Not Identified"}
              </AlertTitle>
              <AlertDescription className="mt-1">
                {result.reason}
                {result.confidence && <span className="ml-2 font-medium">(Confidence: {result.confidence.toFixed(2)})</span>}
              </AlertDescription>

              {result.isPresent && result.snapshots && result.snapshots.length > 0 && (
                <div className="mt-6 pt-4 border-t border-current/20">
                  <h3 className="font-semibold text-md mb-3">Snapshots:</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {result.snapshots.map((snapshot: Snapshot, index: number) => (
                      <div key={index} className="flex flex-col items-center border rounded-lg p-3 bg-background shadow-sm">
                        <img
                          src={snapshot.dataUri}
                          alt={`Snapshot ${index + 1} at ${snapshot.timestamp.toFixed(2)}s`}
                          className="w-full h-auto max-h-48 object-contain rounded-md mb-2 border"
                          data-ai-hint="person snapshot"
                        />
                        <p className="text-sm text-muted-foreground mt-1 font-medium">
                          Timestamp: {snapshot.timestamp.toFixed(2)}s
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
