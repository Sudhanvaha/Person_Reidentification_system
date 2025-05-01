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

// Dummy tool to simulate finding snapshots in the video. In a real application, this would use
// a computer vision model to find frames where the person is visible.
const findSnapshotsTool = ai.defineTool({
  name: 'findSnapshots',
  description: 'Finds snapshots in the video where the person in the photo is visible, along with their timestamps.',
  inputSchema: z.object({
    videoDataUri: z.string().describe("A video of a scene, as a data URI that must include a MIME type and use Base64 encoding."),
    numSnapshots: z.number().describe('The number of snapshots to return.'),
    videoDuration: z.number().describe('The duration of the video in seconds.'),
  }),
  outputSchema: z.array(SnapshotSchema).describe('A list of snapshots (data URIs) with timestamps where the person is visible in the video.'),
}, async input => {
  const { videoDataUri, numSnapshots, videoDuration } = input;
  // In a real application, this would use a computer vision model to find frames where the person is visible.
  // For this example, we'll just return some dummy snapshots with dummy timestamps, ensuring they are within videoDuration.
  const snapshots: Snapshot[] = [];
  // Placeholder 50x50 gray square data URI
  const placeholderDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAIAAACRXR/mAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABFSURBVFhH7c5BDQAwEASh+je9NZY9QVYUqv1okx49e/bs2bNnz549e/bs2bNnz549e/bs2bNnz549e/bs2bNnz549e/bsGa83fAABcltXkyQAAAAASUVORK5CYII=';

  for (let i = 0; i < numSnapshots; i++) {
    // Generate a dummy timestamp (0 to videoDuration seconds).
    // Ensure timestamp is within videoDuration.
    const timestamp = Math.min(Math.random() * videoDuration, videoDuration);
    snapshots.push({
      timestamp: timestamp,
      dataUri: placeholderDataUri, // Use the placeholder data URI
    });
  }
  return snapshots;
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

  Respond with whether the person is present in the video, a confidence score if available, and the reason for your determination.

  If the person is present in the video, use the findSnapshots tool to find 3 snapshots with timestamps where the person is visible. Ensure the timestamps are within the video duration ({{videoDuration}} seconds).`,
});

async function getSnapshots(videoDataUri: string, videoDuration: number): Promise<Snapshot[]> {
  try {
    // Request 3 snapshots from the tool
    const snapshots = await findSnapshotsTool({videoDataUri, numSnapshots: 3, videoDuration});
    // Ensure timestamps are within the video duration
    return snapshots.map(s => ({...s, timestamp: Math.min(s.timestamp, videoDuration)}));
  } catch (error) {
    console.error('Error finding snapshots:', error);
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
    const { output } = await reIdentifyPersonPrompt(promptInput);

    let snapshots: Snapshot[] | undefined = undefined;
    if (output?.isPresent) {
        // Only call getSnapshots if the LLM confirms presence
        snapshots = await getSnapshots(input.videoDataUri, videoDuration);
    }

    // Merge the prompt output with the snapshots
    return { ...output!, snapshots }; // Use non-null assertion as output should be defined
  }
);

export async function reIdentifyPerson(input: ReIdentifyPersonInput): Promise<ReIdentifyPersonOutput> {
  return reIdentifyPersonFlow(input);
}
