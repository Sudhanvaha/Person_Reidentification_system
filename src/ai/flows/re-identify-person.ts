'use server';
/**
 * @fileOverview A person re-identification AI agent.
 *
 * - reIdentifyPerson - A function that handles the person re-identification process.
 * - ReIdentifyPersonInput - The input type for the reIdentifyPerson function.
 * - ReIdentifyPersonOutput - The return type for the reIdentifyPerson function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const ReIdentifyPersonInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a person, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  videoDataUri: z
    .string()
    .describe(
      "A video of a scene, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ReIdentifyPersonInput = z.infer<typeof ReIdentifyPersonInputSchema>;

// Keep Snapshot type for frontend compatibility, though generationStatus won't be used
const SnapshotSchema = z.object({
  timestamp: z.number().describe('The timestamp (in seconds) of the snapshot in the video.'),
  dataUri: z.string().describe("The snapshot image as a data URI (e.g., 'data:image/jpeg;base64,...')."),
  generationStatus: z.enum(['success', 'failed', 'placeholder', 'extracted']).optional().describe('Indicates if the snapshot image was successfully extracted or is a placeholder.'),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;


const ReIdentifyPersonOutputSchema = z.object({
  isPresent: z.boolean().describe('Whether the person in the photo is present in the video.'),
  confidence: z.number().min(0).max(1).optional().describe('The confidence score (0-1) of the re-identification, if available.'),
  reason: z.string().describe('The reason for the determination.'),
  // LLM will now return timestamps instead of generating snapshots directly
  timestamps: z.array(z.number()).optional().describe('Approximate timestamps (in seconds) where the person might be visible in the video, if present. Return up to 3 distinct timestamps.'),
});
// We'll add the extracted snapshots on the client-side, but define the expected final type here
export type ReIdentifyPersonOutputWithSnapshots = z.infer<typeof ReIdentifyPersonOutputSchema> & {
    snapshots?: Snapshot[]; // Snapshots will be added client-side after extraction
};


// Removed findSnapshotsTool as we are moving to client-side extraction


const reIdentifyPersonPrompt = ai.definePrompt({
  name: 'reIdentifyPersonPrompt',
  // tools: [], // Removed tool
  input: {
    schema: z.object({
      photoDataUri: z
        .string()
        .describe(
          "A photo of a person, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
      videoDataUri: z
        .string()
        .describe(
          "A video of a scene, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
      videoDuration: z.number().describe('The duration of the video in seconds.'),
    }),
  },
  output: {
    schema: ReIdentifyPersonOutputSchema, // Use the updated output schema with timestamps
  },
  prompt: `You are an expert system for person re-identification in videos.
  Your task is to determine if the person shown in the reference PHOTO appears anywhere in the provided VIDEO.

  Reference Photo: {{media url=photoDataUri}}
  Video to Analyze: {{media url=videoDataUri}}

  The video duration is {{videoDuration}} seconds.

  Carefully analyze the visual content of the video and compare it against the reference photo. Look for matching individuals based on appearance, clothing, and other visual features.

  Respond with a JSON object containing:
  1.  'isPresent': A boolean indicating if the person is found in the video.
  2.  'confidence': (Optional) A confidence score between 0.0 and 1.0 for your determination.
  3.  'reason': A brief explanation justifying your conclusion (e.g., "Person matching the photo's appearance and clothing seen entering the frame at ~3s" or "No individual matching the photo's description was observed in the video.").
  4.  'timestamps': If and only if you determine the person IS present ('isPresent' is true), provide an array of up to 3 distinct approximate timestamps (in seconds, as numbers, e.g., [2.5, 5.1, 8.0]) where the person is visible. Ensure timestamps are within the video duration (0 to {{videoDuration}} seconds). If the person is not present, return an empty array 'timestamps: []' or omit the field.

  Example Output (Person Found):
  {
    "isPresent": true,
    "confidence": 0.85,
    "reason": "Person matching photo seen near the entrance around 5 seconds.",
    "timestamps": [4.8, 5.1, 5.5]
  }

  Example Output (Person Not Found):
  {
    "isPresent": false,
    "reason": "No individual matching the photo's description was observed.",
    "timestamps": []
  }`,
});


// Removed generateSnapshots helper function


// Function to estimate video duration (basic placeholder)
// In a real app, use HTML5 video element properties on the client *before* sending to the flow.
function estimateVideoDuration(videoDataUri: string): number {
    // THIS IS A VERY ROUGH ESTIMATE AND LIKELY INCORRECT
    // A proper solution requires server-side processing or client-side metadata extraction.
    // Assuming average bitrate and estimating based on Base64 length.
    // Remove header: 'data:video/...;base64,'
    const base64Data = videoDataUri.substring(videoDataUri.indexOf(',') + 1);
    // Estimate bytes (Base64 adds ~33% overhead)
    const bytes = base64Data.length * 0.75;
    // Rough assumption: ~0.5 MB/s (4 Mbps) - adjust as needed
    const estimatedDuration = bytes / (0.5 * 1024 * 1024);
    // Ensure minimum duration of 1s, maximum reasonable estimate (e.g., 120s)
    const cappedDuration = Math.max(1, Math.min(estimatedDuration, 120));
    console.warn(`[estimateVideoDuration] VERY ROUGH estimate: ${cappedDuration.toFixed(2)}s based on ${bytes.toFixed(0)} estimated bytes. Use a proper method in production!`);
    return cappedDuration;
}


const reIdentifyPersonFlow = ai.defineFlow<
  typeof ReIdentifyPersonInputSchema,
  typeof ReIdentifyPersonOutputSchema // Flow now directly returns the schema with timestamps
>(
  {
    name: 'reIdentifyPersonFlow',
    inputSchema: ReIdentifyPersonInputSchema,
    outputSchema: ReIdentifyPersonOutputSchema, // Output includes timestamps
  },
  async (input) => {
    console.log("[reIdentifyPersonFlow] Starting flow...");

    // *** IMPORTANT: Replace this with actual video duration extraction if possible ***
    // Client-side extraction before calling the flow is preferred.
    const videoDuration = estimateVideoDuration(input.videoDataUri);
    console.log(`[reIdentifyPersonFlow] Using estimated video duration: ${videoDuration.toFixed(2)}s`);

    const promptInput = { ...input, videoDuration };

    console.log("[reIdentifyPersonFlow] Calling reIdentifyPersonPrompt (LLM)...");
    const llmResponse = await reIdentifyPersonPrompt(promptInput);
    const llmOutput = llmResponse.output;

    if (!llmOutput) {
        console.error("[reIdentifyPersonFlow] LLM did not return a valid output.");
        throw new Error("LLM analysis failed to produce an output.");
    }

    // Ensure timestamps are within bounds and sorted (optional but good practice)
    if (llmOutput.timestamps) {
        llmOutput.timestamps = llmOutput.timestamps
            .filter(t => t >= 0 && t <= videoDuration)
            .sort((a, b) => a - b);
         console.log(`[reIdentifyPersonFlow] LLM Result: isPresent=${llmOutput.isPresent}, Confidence=${llmOutput.confidence?.toFixed(2)}, Reason=${llmOutput.reason}, Timestamps=[${llmOutput.timestamps.join(', ')}]`);
    } else {
        console.log(`[reIdentifyPersonFlow] LLM Result: isPresent=${llmOutput.isPresent}, Confidence=${llmOutput.confidence?.toFixed(2)}, Reason=${llmOutput.reason}, No Timestamps Provided.`);
        llmOutput.timestamps = []; // Ensure timestamps array exists even if empty
    }


    // Return the LLM output directly. Snapshot extraction will happen client-side.
    return llmOutput;
  }
);

// Exported function remains the same, but the return type reflects the direct output from the flow
export async function reIdentifyPerson(input: ReIdentifyPersonInput): Promise<ReIdentifyPersonOutput> {
  console.log("[reIdentifyPerson] Invoking reIdentifyPersonFlow...");
  try {
      const result = await reIdentifyPersonFlow(input);
      console.log("[reIdentifyPerson] Flow completed successfully.");
      console.log("[reIdentifyPerson] Final Result:", result);
      return result;
  } catch (error) {
      console.error("[reIdentifyPerson] Error executing reIdentifyPersonFlow:", error);
       return {
            isPresent: false,
            reason: `An error occurred during processing: ${error instanceof Error ? error.message : 'Unknown error'}`,
            timestamps: [], // Ensure timestamps is an empty array on error
        };
  }
}
