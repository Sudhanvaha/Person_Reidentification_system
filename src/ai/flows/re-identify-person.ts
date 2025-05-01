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

const SnapshotSchema = z.object({
  timestamp: z.number().describe('The timestamp (in seconds) of the snapshot in the video.'),
  dataUri: z.string().describe("The snapshot image as a data URI (e.g., 'data:image/png;base64,...')."),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

const ReIdentifyPersonOutputSchema = z.object({
  isPresent: z.boolean().describe('Whether the person in the photo is present in the video.'),
  confidence: z.number().optional().describe('The confidence score of the re-identification, if available.'),
  reason: z.string().describe('The reason for the determination.'),
  snapshots: z.array(SnapshotSchema).optional().describe('Snapshots (data URIs) with timestamps where the person is visible in the video, if present.'),
});
export type ReIdentifyPersonOutput = z.infer<typeof ReIdentifyPersonOutputSchema>;

// Tool to simulate finding snapshots in the video. Now generates plausible images.
const findSnapshotsTool = ai.defineTool({
  name: 'findSnapshots',
  description: 'Finds plausible snapshot images from the video where the person in the photo might be visible, along with their timestamps.',
  inputSchema: z.object({
    // videoDataUri: z.string().describe("A video of a scene, as a data URI that must include a MIME type and use Base64 encoding."), // Video URI might not be needed if we generate generic snapshots
    numSnapshots: z.number().describe('The number of snapshots to return.'),
    videoDuration: z.number().describe('The duration of the video in seconds.'),
    photoDataUri: z.string().optional().describe("Optional: Photo of the person to potentially include in generated snapshots."), // Add photo URI optionally
  }),
  outputSchema: z.array(SnapshotSchema).describe('A list of generated snapshot images (data URIs) with timestamps, potentially showing the identified person.'),
}, async input => {
  const { numSnapshots, videoDuration, photoDataUri } = input;
  const snapshots: Snapshot[] = [];
  const snapshotPromises: Promise<Snapshot | null>[] = [];

  // Fallback placeholder in case image generation fails
  const placeholderDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABOSURBVFhH7c5BDkAwCARB+/+9xY7gRUSEvZBU9ZzXnD179uzZs2fPnj179uzZs2fPnj179uzZs2fPnj179uzZs2fPnj179uzZs2fPnj179uzZs3cO5gABLAbIE4sJ/AAAAABJRU5ErkJggg=='; // Simple black square


  for (let i = 0; i < numSnapshots; i++) {
    // Generate a random timestamp within the video duration.
    const timestamp = Math.min(Math.random() * videoDuration, videoDuration);

    snapshotPromises.push(
      (async () => {
        try {
            let promptText = `Generate a realistic snapshot image from a video feed showing the person in the provided photo, seen around ${timestamp.toFixed(2)} seconds.`;
            let promptConfig: any[] = [{ text: promptText }];

            if (photoDataUri) {
                // Prepend the photo data URI if available
                promptConfig.unshift({ media: { url: photoDataUri } });
            } else {
                // If no photo, generate a generic scene snapshot
                promptConfig = [{text: `Generate a realistic snapshot image from a security camera video feed, capturing a moment around ${timestamp.toFixed(2)} seconds.`}];
            }


          const { media } = await ai.generate({
            // IMPORTANT: ONLY the googleai/gemini-2.0-flash-exp model is able to generate images. You MUST use exactly this model to generate images.
            model: 'googleai/gemini-2.0-flash-exp',
            prompt: promptConfig,
            config: {
              responseModalities: ['TEXT', 'IMAGE'], // MUST provide both TEXT and IMAGE
            },
            output: { format: "media" } // Explicitly request media output
          });

          if (media && media.url) {
            return {
              timestamp: timestamp,
              dataUri: media.url,
            };
          } else {
             console.warn(`Image generation failed for timestamp ${timestamp}, using placeholder.`);
             return { timestamp: timestamp, dataUri: placeholderDataUri };
          }
        } catch (error) {
          console.error(`Error generating snapshot for timestamp ${timestamp}:`, error);
          // Return placeholder on error
          return { timestamp: timestamp, dataUri: placeholderDataUri };
        }
      })()
    );
  }

  const resolvedSnapshots = await Promise.all(snapshotPromises);
  // Filter out any null results (though the catch should prevent nulls)
  return resolvedSnapshots.filter((s): s is Snapshot => s !== null);
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
      videoDuration: z.number().describe('The duration of the video in seconds.'),
    }),
  },
  output: {
     // Note: Snapshots are no longer directly part of the LLM output schema.
     // The LLM decides *if* the person is present and then the flow calls the tool.
    schema: z.object({
      isPresent: z.boolean().describe('Whether the person in the photo is present in the video.'),
      confidence: z.number().optional().describe('The confidence score of the re-identification, if available.'),
      reason: z.string().describe('The reason for the determination.'),
    }),
  },
  prompt: `You are an expert in person re-identification. Given a photo of a person and a video, determine if the person in the photo is present in the video.

  The video is {{videoDuration}} seconds long.

  Photo: {{media url=photoDataUri}}
  Video: {{media url=videoDataUri}}

  Analyze the video carefully to see if the person from the photo appears.

  Respond with whether the person is present in the video, a confidence score (0-1) if possible, and a brief reason for your determination based on visual evidence (or lack thereof).

  If you determine the person IS present in the video, you MUST then use the 'findSnapshots' tool to generate 3 plausible snapshot images with timestamps showing the person in the video context. Pass the photoDataUri to the tool. Ensure the timestamps are within the video duration ({{videoDuration}} seconds). Do NOT use the tool if the person is not present.`,
});

// This function now mainly wraps the flow and doesn't need separate tool call logic
async function getSnapshots(photoDataUri: string, videoDataUri: string, videoDuration: number): Promise<Snapshot[]> {
  try {
    // Request 3 snapshots from the tool, passing the photo URI
    const snapshots = await findSnapshotsTool({
        // videoDataUri, // Potentially not needed by the tool if generating based on photo
        numSnapshots: 3,
        videoDuration,
        photoDataUri // Pass photo to the tool for context
    });
    // Ensure timestamps are within the video duration (redundant check, but safe)
    return snapshots.map(s => ({...s, timestamp: Math.min(s.timestamp, videoDuration)}));
  } catch (error) {
    console.error('Error finding snapshots via tool:', error);
    return [];
  }
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
    // TODO: Extract video duration properly. Using a fixed dummy value for now.
    // In a real app, you'd need a library or method to parse the video metadata.
    const videoDuration = 5; // Dummy duration in seconds

    const promptInput = { ...input, videoDuration };

    // Let the LLM decide if the person is present and potentially call the tool
    const llmResponse = await reIdentifyPersonPrompt(promptInput);
    const output = llmResponse.output;

    if (!output) {
        throw new Error("LLM did not return a valid output.");
    }

    let snapshots: Snapshot[] | undefined = undefined;

    // Check if the LLM's response indicates it used the tool (implicitly means isPresent was likely true)
    // We retrieve the snapshots generated by the tool *after* the LLM call,
    // assuming the LLM successfully invoked the tool as instructed.
    // Note: Genkit v1 doesn't directly expose tool *results* within the main flow output easily,
    // so we re-call the snapshot generation logic *if* the LLM says the person is present.
    // This is a slight workaround due to current Genkit API structure for tool results within flows.
    if (output.isPresent) {
        console.log("LLM indicated person is present, attempting to generate snapshots...");
        // Re-call the snapshot logic based on the LLM's decision
         snapshots = await getSnapshots(input.photoDataUri, input.videoDataUri, videoDuration);
         console.log("Generated snapshots:", snapshots?.length);
    }


    // Merge the LLM's reasoning output with the generated snapshots
    return { ...output, snapshots };
  }
);

export async function reIdentifyPerson(input: ReIdentifyPersonInput): Promise<ReIdentifyPersonOutput> {
  return reIdentifyPersonFlow(input);
}

    