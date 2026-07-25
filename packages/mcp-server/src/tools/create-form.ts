import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../client.js";

export function registerCreateForm(server: McpServer): void {
  server.tool(
    "create_form",
    "Create a form for collecting user responses. Can auto-tag responders and enroll them in scenarios.",
    {
      name: z.string().describe("Form name"),
      description: z
        .string()
        .optional()
        .describe("Form description shown to users"),
      fields: z
        .string()
        .describe(
          "JSON string of form fields. Format: [{ name: string, label: string, type: 'text'|'email'|'tel'|'number'|'textarea'|'select'|'radio'|'checkbox'|'date'|'heading', required?: boolean, options?: string[], placeholder?: string }]. Use type 'heading' for a display-only section header (no input; give it a unique name and required:false). All labels support manual line breaks with \\n.",
        ),
      onSubmitTagId: z
        .string()
        .optional()
        .describe("Tag ID to auto-apply when form is submitted"),
      onSubmitRemoveTagId: z
        .string()
        .optional()
        .describe("Tag ID to REMOVE when the form is submitted (null to clear). Use for mutually exclusive attributes: tags are only ever added, so someone who submits both of a pair of forms (e.g. restaurant / non-restaurant role registration) ends up holding both tags, which skews later branching, segmented broadcasts and reporting. Set each form to remove its counterpart so only the latest choice remains."),
      onSubmitScenarioId: z
        .string()
        .optional()
        .describe("Scenario ID to auto-enroll when form is submitted"),
      onSubmitMessageType: z
        .enum(["text", "flex"])
        .optional()
        .describe("Custom message type to send after submission. Supports template variables: {{name}}, {{auth_url:CHANNEL_ID}}"),
      onSubmitMessageContent: z
        .string()
        .optional()
        .describe("Custom message content to send after submission. If set, replaces the default confirmation Flex."),
      saveToMetadata: z
        .boolean()
        .default(true)
        .describe("Save form responses to friend metadata"),
      accountId: z
        .string()
        .optional()
        .describe("LINE account ID (uses default if omitted)"),
    },
    async ({
      name,
      description,
      fields,
      onSubmitTagId,
      onSubmitRemoveTagId,
      onSubmitScenarioId,
      onSubmitMessageType,
      onSubmitMessageContent,
      saveToMetadata,
    }) => {
      try {
        const client = getClient();
        const form = await client.forms.create({
          name,
          description,
          fields: JSON.parse(fields),
          onSubmitTagId,
          onSubmitRemoveTagId,
          onSubmitScenarioId,
          onSubmitMessageType,
          onSubmitMessageContent,
          saveToMetadata,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, form }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { success: false, error: String(error) },
                null,
                2,
              ),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
