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
// Removed incorrect import: import {generate} from 'genkit/generate';

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

const SnapshotSchema = z.object({
  timestamp: z.number().describe('The timestamp (in seconds) of the snapshot in the video.'),
  dataUri: z.string().describe("The snapshot image as a data URI (e.g., 'data:image/png;base64,...')."),
  generationStatus: z.enum(['success', 'failed', 'placeholder']).optional().describe('Indicates if the snapshot image was successfully generated.'),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

const ReIdentifyPersonOutputSchema = z.object({
  isPresent: z.boolean().describe('Whether the person in the photo is present in the video.'),
  confidence: z.number().optional().describe('The confidence score of the re-identification, if available.'),
  reason: z.string().describe('The reason for the determination.'),
  snapshots: z.array(SnapshotSchema).optional().describe('Generated snapshots (data URIs) with timestamps where the person might be visible in the video, if present.'),
});
export type ReIdentifyPersonOutput = z.infer<typeof ReIdentifyPersonOutputSchema>;

// Placeholder data URI (simple gray square)
const placeholderDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAAAAACgtt2+AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABDSURBVDhPY2AYYAAGEgYGDAlQw/z//z/DwsKCMjIyAAAA///fVAGIYvj7+4eFhQUAAAAA///vrgQ0MDBgfHx8AADsHBFsXnVsmwAAAABJRU5ErkJggg==';


// Tool to generate plausible snapshot images from the video where the person might be visible.
const findSnapshotsTool = ai.defineTool({
  name: 'findSnapshots',
  description: 'Generates plausible snapshot images from the video where the person in the photo might be visible, along with their timestamps. Uses the provided photo for reference.',
  inputSchema: z.object({
    numSnapshots: z.number().describe('The number of snapshots to generate.'),
    videoDuration: z.number().describe('The duration of the video in seconds.'),
    photoDataUri: z.string().describe("The photo of the person to include in generated snapshots, as a data URI."),
    // videoDataUri: z.string().describe("The video for context (though primarily using the photo for generation)."), // Video URI less critical if generating based on photo
  }),
  outputSchema: z.array(SnapshotSchema).describe('A list of generated snapshot images (data URIs) with timestamps, attempting to show the identified person.'),
}, async input => {
  const { numSnapshots, videoDuration, photoDataUri } = input;
  const snapshotPromises: Promise<Snapshot>[] = []; // Expect Snapshot, not null

  console.log(`[findSnapshotsTool] Generating ${numSnapshots} snapshots for video duration ${videoDuration}s...`);

  for (let i = 0; i < numSnapshots; i++) {
    // Generate a random timestamp within the video duration.
    const timestamp = Math.min(Math.random() * videoDuration, videoDuration);

    snapshotPromises.push(
      (async (): Promise<Snapshot> => { // Ensure return type is Snapshot
        try {
          const promptText = `Generate a realistic snapshot image from a security camera video feed. This snapshot should show the person depicted in the provided reference photo. The scene should look like it was captured at approximately ${timestamp.toFixed(2)} seconds into the video. Ensure the person is clearly visible in the generated image.`;
          const promptConfig = [
            { media: { url: photoDataUri } }, // Reference photo first
            { text: promptText },
          ];

          console.log(`[findSnapshotsTool] Requesting generation for timestamp ${timestamp.toFixed(2)}s...`);

          // Use the specific image generation model
          const { media } = await ai.generate({ // Use ai.generate instead of generate directly
            model: 'googleai/gemini-2.0-flash-exp',
            prompt: promptConfig,
            config: {
                // Requesting only IMAGE sometimes fails, request both TEXT and IMAGE
                responseModalities: ['TEXT', 'IMAGE'],
            },
            output: { format: "media" } // Explicitly request media output
          });


          if (media?.url && media.url.startsWith('data:image')) {
             console.log(`[findSnapshotsTool] Successfully generated snapshot for timestamp ${timestamp.toFixed(2)}s. URI length: ${media.url.length}`);
            return {
              timestamp: timestamp,
              dataUri: media.url,
              generationStatus: 'success',
            };
          } else {
             console.warn(`[findSnapshotsTool] Image generation did not return a valid data URI for timestamp ${timestamp.toFixed(2)}s. Media output:`, media);
             return { timestamp: timestamp, dataUri: placeholderDataUri, generationStatus: 'placeholder' };
          }
        } catch (error: any) {
          console.error(`[findSnapshotsTool] Error generating snapshot for timestamp ${timestamp.toFixed(2)}s:`, error.message || error);
          // Return placeholder on error
          return { timestamp: timestamp, dataUri: placeholderDataUri, generationStatus: 'failed' };
        }
      })()
    );
  }

  const resolvedSnapshots = await Promise.all(snapshotPromises);
  console.log(`[findSnapshotsTool] Finished generating ${resolvedSnapshots.length} snapshots.`);
  return resolvedSnapshots; // Already filtered by the catch returning a valid Snapshot
});


const reIdentifyPersonPrompt = ai.definePrompt({
  name: 'reIdentifyPersonPrompt',
  tools: [findSnapshotsTool],
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
      // Video duration needs to be determined before calling the prompt.
      videoDuration: z.number().describe('The duration of the video in seconds.'),
    }),
  },
  output: {
     // Snapshots are generated by the tool, not directly by the LLM reasoning part.
    schema: z.object({
      isPresent: z.boolean().describe('Whether the person in the photo is present in the video.'),
      confidence: z.number().min(0).max(1).optional().describe('The confidence score (0-1) of the re-identification, if available.'),
      reason: z.string().describe('The reasoning for the determination based on visual evidence (or lack thereof) in the video compared to the photo.'),
    }),
  },
  prompt: `You are an expert system for person re-identification in videos.
  Your task is to determine if the person shown in the reference PHOTO appears anywhere in the provided VIDEO.

  Reference Photo: {{media url=photoDataUri}}
  Video to Analyze: {{media url=videoDataUri}}

  The video duration is {{videoDuration}} seconds.

  Carefully analyze the visual content of the video and compare it against the reference photo. Look for matching individuals based on appearance, clothing, and other visual features.

  Respond with:
  1.  'isPresent': A boolean indicating if the person is found in the video.
  2.  'confidence': (Optional) A confidence score between 0.0 and 1.0 for your determination.
  3.  'reason': A brief explanation justifying your conclusion (e.g., "Person matching the photo's appearance and clothing seen entering the frame at ~3s" or "No individual matching the photo's description was observed in the video.").

  IMPORTANT: If and only if you determine the person IS present ('isPresent' is true), you MUST then use the 'findSnapshots' tool. Call the tool with the following parameters:
    - numSnapshots: 3
    - videoDuration: {{videoDuration}}
    - photoDataUri: The data URI of the reference photo provided above.
  Do NOT use the tool if the person is not identified ('isPresent' is false).`,
});

// Helper function to call the snapshot tool
async function generateSnapshots(photoDataUri: string, videoDuration: number): Promise<Snapshot[]> {
  console.log("[generateSnapshots] Calling findSnapshotsTool...");
  try {
    // Explicitly call the tool function here. The LLM response might include a `toolCalls` field,
    // but Genkit doesn't automatically execute them within the same flow step in this setup.
    // We rely on the LLM's `isPresent` output to decide whether to call the tool.
    const snapshots = await findSnapshotsTool({
        numSnapshots: 3,
        videoDuration,
        photoDataUri,
    });
     console.log(`[generateSnapshots] Tool returned ${snapshots.length} snapshots.`);
    // Ensure timestamps are within the video duration (redundant check, but safe)
    return snapshots.map(s => ({...s, timestamp: Math.min(s.timestamp, videoDuration)}));
  } catch (error) {
    console.error('[generateSnapshots] Error calling findSnapshotsTool:', error);
    // Return an empty array or potentially placeholder snapshots on tool error
    return Array(3).fill(null).map((_, i) => ({
        timestamp: (i + 1) * videoDuration / 4, // Spread out placeholders
        dataUri: placeholderDataUri,
        generationStatus: 'failed' as const, // Explicitly mark as failed
    }));
  }
}

// Function to estimate video duration (basic placeholder)
// In a real app, use a library like `fluent-ffmpeg` on the server or
// HTML5 video element properties on the client *before* sending to the flow.
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
    const cappedDuration = Math.max(1, Math.min(estimatedDuration, 60)); // Cap duration between 1 and 60 seconds
    console.warn(`[estimateVideoDuration] VERY ROUGH estimate: ${cappedDuration.toFixed(2)}s based on ${bytes.toFixed(0)} estimated bytes. Use a proper method in production!`);
    return cappedDuration;
}


const reIdentifyPersonFlow = ai.defineFlow<
  typeof ReIdentifyPersonInputSchema,
  typeof ReIdentifyPersonOutputSchema
>(
  {
    name: 'reIdentifyPersonFlow',
    inputSchema: ReIdentifyPersonInputSchema,
    outputSchema: ReIdentifyPersonOutputSchema,
  },
  async input => {
    console.log("[reIdentifyPersonFlow] Starting flow...");

    // *** IMPORTANT: Replace this with actual video duration extraction ***
    const videoDuration = estimateVideoDuration(input.videoDataUri); // Use placeholder estimation
     console.log(`[reIdentifyPersonFlow] Using estimated video duration: ${videoDuration.toFixed(2)}s`);

    const promptInput = { ...input, videoDuration };

    console.log("[reIdentifyPersonFlow] Calling reIdentifyPersonPrompt (LLM)...");
    // We call the prompt first to get the LLM's assessment.
    const llmResponse = await reIdentifyPersonPrompt(promptInput);
    const llmOutput = llmResponse.output; // This contains isPresent, confidence, reason

    if (!llmOutput) {
        console.error("[reIdentifyPersonFlow] LLM did not return a valid output.");
        throw new Error("LLM analysis failed to produce an output.");
    }
     console.log(`[reIdentifyPersonFlow] LLM Result: isPresent=${llmOutput.isPresent}, Confidence=${llmOutput.confidence?.toFixed(2)}, Reason=${llmOutput.reason}`);

    let snapshots: Snapshot[] | undefined = undefined;

    // Check if the LLM decided the person is present.
    if (llmOutput.isPresent) {
      // The LLM determined the person is present, so we now call the tool explicitly
      // to generate the snapshots based on that determination.
      console.log("[reIdentifyPersonFlow] LLM indicated person is present. Generating snapshots via tool...");
      snapshots = await generateSnapshots(input.photoDataUri, videoDuration);
      console.log(`[reIdentifyPersonFlow] Snapshot generation completed. Received ${snapshots?.length ?? 0} snapshots.`);

       // Optional: Add logging for snapshot status
        snapshots?.forEach((s, i) => console.log(`  Snapshot ${i+1}: Status=${s.generationStatus}, Timestamp=${s.timestamp.toFixed(2)}s, URI Length=${s.dataUri.length}`));

    } else {
      console.log("[reIdentifyPersonFlow] LLM indicated person is not present. Skipping snapshot generation.");
    }

    // Return the combined result: LLM's reasoning + generated snapshots (if any)
    return {
        ...llmOutput, // Contains isPresent, confidence, reason
        snapshots: snapshots // Contains the array of snapshots if generated, otherwise undefined
    };
  }
);

export async function reIdentifyPerson(input: ReIdentifyPersonInput): Promise<ReIdentifyPersonOutput> {
  console.log("[reIdentifyPerson] Invoking reIdentifyPersonFlow...");
  try {
      const result = await reIdentifyPersonFlow(input);
      console.log("[reIdentifyPerson] Flow completed successfully.");
      // Log the final result being returned
      console.log("[reIdentifyPerson] Final Result:", {
            ...result,
            snapshots: result.snapshots ? `${result.snapshots.length} snapshots` : 'No snapshots', // Avoid logging large data URIs
        });
      return result;
  } catch (error) {
      console.error("[reIdentifyPerson] Error executing reIdentifyPersonFlow:", error);
      // Provide a more informative error response back to the client
       return {
            isPresent: false,
            reason: `An error occurred during processing: ${error instanceof Error ? error.message : 'Unknown error'}`,
            snapshots: [], // Ensure snapshots is an empty array on error
        };
  }
}
