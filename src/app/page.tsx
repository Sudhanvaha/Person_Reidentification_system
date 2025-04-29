"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { reIdentifyPerson } from "@/ai/flows/re-identify-person";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle, XCircle, Upload, Video } from "lucide-react";

export default function Home() {
  const [photoDataUri, setPhotoDataUri] = useState<string | null>(null);
  const [videoDataUri, setVideoDataUri] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const onDropPhoto = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoDataUri(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const onDropVideo = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    const reader = new FileReader();
    reader.onload = () => {
      setVideoDataUri(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const { getRootProps: getPhotoRootProps, getInputProps: getPhotoInputProps } = useDropzone({
    onDrop: onDropPhoto,
    multiple: false,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.bmp'],
    }
  });

  const { getRootProps: getVideoRootProps, getInputProps: getVideoInputProps } = useDropzone({
    onDrop: onDropVideo,
    multiple: false,
    accept: {
      'video/*': ['.mp4', '.mov', '.avi', '.wmv'],
    }
  });

  const handleReIdentify = async () => {
    if (!photoDataUri || !videoDataUri) {
      alert("Please upload both a photo and a video.");
      return;
    }

    setLoading(true);
    try {
      const reIdentificationResult = await reIdentifyPerson({
        photoDataUri: photoDataUri,
        videoDataUri: videoDataUri,
      });
      setResult(reIdentificationResult);
    } catch (error: any) {
      console.error("Error during re-identification:", error);
      setResult({
        isPresent: false,
        reason: `Error during processing: ${error.message || 'Unknown error'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-2">
      <h1 className="text-2xl font-bold mb-4">ReIDentify</h1>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Upload Image</CardTitle>
          <CardDescription>Upload an image of the person you want to identify.</CardDescription>
        </CardHeader>
        <CardContent>
          <div {...getPhotoRootProps()} className="flex items-center justify-center w-full h-32 bg-muted rounded-md cursor-pointer">
            <Input {...getPhotoInputProps()} id="photo-upload" className="hidden" />
            <label htmlFor="photo-upload" className="flex flex-col items-center justify-center">
              {photoDataUri ? (
                <img src={photoDataUri} alt="Uploaded Person" className="max-h-24 max-w-full rounded-md" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-sm text-muted-foreground">Click or drag photo to upload</span>
                </>
              )}
            </label>
          </div>
        </CardContent>
      </Card>

      <Card className="w-full max-w-md mt-4">
        <CardHeader>
          <CardTitle>Upload Video</CardTitle>
          <CardDescription>Upload a video to check if the person is present.</CardDescription>
        </CardHeader>
        <CardContent>
          <div {...getVideoRootProps()} className="flex items-center justify-center w-full h-32 bg-muted rounded-md cursor-pointer">
            <Input {...getVideoInputProps()} id="video-upload" className="hidden" />
            <label htmlFor="video-upload" className="flex flex-col items-center justify-center">
              {videoDataUri ? (
                <video src={videoDataUri} alt="Uploaded Video" className="max-h-24 max-w-full rounded-md" controls />
              ) : (
                <>
                  <Video className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-sm text-muted-foreground">Click or drag video to upload</span>
                </>
              )}
            </label>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleReIdentify} disabled={loading} className="mt-6 bg-primary text-primary-foreground hover:bg-primary/90">
        {loading ? "Identifying..." : "Identify Person"}
      </Button>

      {result && (
        <Card className="w-full max-w-md mt-6">
          <CardHeader>
            <CardTitle>Re-identification Result</CardTitle>
          </CardHeader>
          <CardContent>
            <Alert className={result.isPresent ? "bg-green-100 border-green-500 text-green-700" : "bg-red-100 border-red-500 text-red-700"}>
              {result.isPresent ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>Person Identified</AlertTitle>
                  <AlertDescription>
                    The person in the image is present in the video. Reason: {result.reason}
                    {result.confidence && <>, Confidence: {result.confidence}</>}
                  </AlertDescription>
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Person Not Identified</AlertTitle>
                  <AlertDescription>
                    The person in the image is not present in the video. Reason: {result.reason}
                  </AlertDescription>
                </>
              )}
            </Alert>
          </CardContent>
        </Card>
      )}
      </div>
  );
}
