'use server';
/**
 * @fileOverview A person re-identification AI agent with bounding box output.
 *
 * - reIdentifyPerson - A function that handles the person re-identification process.
 * - ReIdentifyPersonInput - The input type for the reIdentifyPerson function.
 * - ReIdentifyPersonOutput - The return type for the reIdentifyPerson function.
 * - IdentificationResult - Represents a timestamp and optional bounding box.
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

// Define Bounding Box schema
const BoundingBoxSchema = z.object({
    xMin: z.number().min(0).max(1).describe('Normalized X coordinate of the top-left corner (0-1).'),
    yMin: z.number().min(0).max(1).describe('Normalized Y coordinate of the top-left corner (0-1).'),
    xMax: z.number().min(0).max(1).describe('Normalized X coordinate of the bottom-right corner (0-1).'),
    yMax: z.number().min(0).max(1).describe('Normalized Y coordinate of the bottom-right corner (0-1).'),
}).describe('Normalized bounding box coordinates (0.0 to 1.0) of the identified person.');
export type BoundingBox = z.infer<typeof BoundingBoxSchema>; // Export BoundingBox type

// Combine timestamp and optional bounding box
const IdentificationResultSchema = z.object({
  timestamp: z.number().describe('Approximate timestamp (in seconds) where the person is visible.'),
  boundingBox: BoundingBoxSchema.optional().describe('Bounding box of the person at this timestamp, if clearly identifiable.'),
});
export type IdentificationResult = z.infer<typeof IdentificationResultSchema>;


const ReIdentifyPersonOutputSchema = z.object({
  isPresent: z.boolean().describe('Whether the person in the photo is present in the video.'),
  confidence: z.number().min(0).max(1).optional().describe('The confidence score (0-1) of the re-identification, if available.'),
  reason: z.string().describe('The reason for the determination.'),
  // Use the new IdentificationResult schema for timestamps and boxes
  identifications: z.array(IdentificationResultSchema).optional().describe('List of timestamps and optional bounding boxes where the person might be visible, if present. Return up to 3 distinct identifications.'),
});
export type ReIdentifyPersonOutput = z.infer<typeof ReIdentifyPersonOutputSchema>;


// Define Snapshot schema used for client-side rendering
const SnapshotSchema = z.object({
  timestamp: z.number().describe('The timestamp (in seconds) of the snapshot in the video.'),
  dataUri: z.string().describe("The snapshot image as a data URI (e.g., 'data:image/jpeg;base64,...')."),
  generationStatus: z.enum(['extracted', 'failed', 'placeholder']).optional().describe('Indicates if the snapshot image was successfully extracted or is a placeholder.'),
  boundingBox: BoundingBoxSchema.optional().describe('Bounding box associated with this snapshot.'), // Add bounding box here too
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

// Type for the final result combined on the client-side
export type ReIdentifyPersonOutputWithSnapshots = Omit<ReIdentifyPersonOutput, 'identifications'> & {
    snapshots?: Snapshot[]; // Snapshots will be added client-side after extraction
    identifications?: IdentificationResult[]; // Keep identifications for reference
};



const reIdentifyPersonPrompt = ai.definePrompt({
  name: 'reIdentifyPersonPrompt',
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
    schema: ReIdentifyPersonOutputSchema, // Use the updated output schema
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
  4.  'identifications': If and only if you determine the person IS present ('isPresent' is true), provide an array of up to 3 distinct 'IdentificationResult' objects. Each object should contain:
        a. 'timestamp': An approximate timestamp (in seconds, as a number, e.g., 2.5) where the person is visible. Ensure timestamps are within the video duration (0 to {{videoDuration}} seconds).
        b. 'boundingBox': (Optional) If the person is clearly identifiable at that timestamp, provide a 'boundingBox' object with normalized coordinates (0.0 to 1.0) for the person's location in the frame: { "xMin": <number>, "yMin": <number>, "xMax": <number>, "yMax": <number> }. Make sure xMin < xMax and yMin < yMax. If a bounding box cannot be reliably determined, omit this field or set it to null.
     If the person is not present, return an empty array 'identifications: []' or omit the field.

  Example Output (Person Found with Bounding Box):
  {
    "isPresent": true,
    "confidence": 0.85,
    "reason": "Person matching photo seen near the entrance around 5 seconds.",
    "identifications": [
      {
        "timestamp": 4.8,
        "boundingBox": { "xMin": 0.6, "yMin": 0.2, "xMax": 0.8, "yMax": 0.7 }
      },
      { "timestamp": 5.5 } // Bounding box might be omitted if unclear
    ]
  }

  Example Output (Person Not Found):
  {
    "isPresent": false,
    "reason": "No individual matching the photo's description was observed.",
    "identifications": []
  }`,
});


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
  typeof ReIdentifyPersonOutputSchema // Flow now returns the schema with identifications (timestamp + optional box)
>(
  {
    name: 'reIdentifyPersonFlow',
    inputSchema: ReIdentifyPersonInputSchema,
    outputSchema: ReIdentifyPersonOutputSchema, // Output includes identifications array
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

    // Validate and clean up identifications
    if (llmOutput.identifications) {
        llmOutput.identifications = llmOutput.identifications
            .filter(id => id.timestamp >= 0 && id.timestamp <= videoDuration) // Ensure timestamp is valid
            .map(id => {
                // Ensure bounding box values are within 0-1 and valid if present
                if (id.boundingBox) {
                    const bb = id.boundingBox;
                    if (bb.xMin < 0 || bb.xMin > 1 || bb.yMin < 0 || bb.yMin > 1 ||
                        bb.xMax < 0 || bb.xMax > 1 || bb.yMax < 0 || bb.yMax > 1 ||
                        bb.xMin >= bb.xMax || bb.yMin >= bb.yMax) {
                        console.warn(`[reIdentifyPersonFlow] Invalid bounding box received for timestamp ${id.timestamp}, removing it. Box:`, bb);
                        // Return identification without the invalid bounding box
                        return { timestamp: id.timestamp, boundingBox: undefined };
                    }
                }
                // Return the identification as is (either with valid box or no box)
                return id;
            })
            .sort((a, b) => a.timestamp - b.timestamp); // Sort by timestamp

        console.log(`[reIdentifyPersonFlow] LLM Result: isPresent=${llmOutput.isPresent}, Confidence=${llmOutput.confidence?.toFixed(2)}, Reason=${llmOutput.reason}, Validated Identifications=`, llmOutput.identifications);
    } else {
        console.log(`[reIdentifyPersonFlow] LLM Result: isPresent=${llmOutput.isPresent}, Confidence=${llmOutput.confidence?.toFixed(2)}, Reason=${llmOutput.reason}, No Identifications Provided.`);
        llmOutput.identifications = []; // Ensure identifications array exists even if empty
    }


    // Return the LLM output directly. Snapshot extraction and bounding box display will happen client-side.
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
       // Ensure the error response matches the schema
       return {
            isPresent: false,
            reason: `An error occurred during processing: ${error instanceof Error ? error.message : 'Unknown error'}`,
            identifications: [], // Ensure identifications is an empty array on error
        };
  }
}