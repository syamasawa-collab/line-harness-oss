import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getClient } from "../client.js";

export function registerManageTags(server: McpServer): void {
  server.tool(
    "manage_tags",
    "List, create, rename, or delete tags, and add/remove tags to/from friends. Supports batch operations on multiple friends. Use 'usage' to see everywhere a tag is referenced (friends, scenarios, forms, broadcasts, links) BEFORE deleting or renaming it — delete is destructive.",
    {
      action: z.enum(["list", "create", "update", "usage", "delete", "add", "remove"]).describe("Action to perform"),
      tagName: z
        .string()
        .optional()
        .describe("Tag name (for 'create' action, or new name for 'update')"),
      tagColor: z
        .string()
        .optional()
        .describe("Tag color hex code (for 'create' or 'update' actions, e.g. '#FF0000')"),
      tagId: z
        .string()
        .optional()
        .describe("Tag ID (for 'update', 'usage', 'delete', 'add' or 'remove' actions)"),
      friendIds: z
        .array(z.string())
        .optional()
        .describe(
          "Friend IDs to add/remove the tag from (for 'add' or 'remove' actions)",
        ),
    },
    async ({ action, tagName, tagColor, tagId, friendIds }) => {
      try {
        const client = getClient();

        if (action === "list") {
          const tags = await client.tags.list();
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ success: true, tags }, null, 2) }],
          };
        }

        if (action === "update") {
          if (!tagId) throw new Error("tagId is required for update action");
          if (!tagName && !tagColor)
            throw new Error("tagName or tagColor is required for update action");
          const tag = await client.tags.update(tagId, {
            ...(tagName ? { name: tagName } : {}),
            ...(tagColor ? { color: tagColor } : {}),
          });
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ success: true, tag }, null, 2) }],
          };
        }

        if (action === "usage") {
          if (!tagId) throw new Error("tagId is required for usage action");
          const usage = await client.tags.usage(tagId);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ success: true, usage }, null, 2) }],
          };
        }

        if (action === "delete") {
          if (!tagId) throw new Error("tagId is required for delete action");
          await client.tags.delete(tagId);
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ success: true, deleted: tagId }, null, 2) }],
          };
        }

        if (action === "create") {
          if (!tagName) throw new Error("tagName is required for create action");
          const tag = await client.tags.create({
            name: tagName,
            color: tagColor,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, tag }, null, 2),
              },
            ],
          };
        }

        if (!tagId)
          throw new Error("tagId is required for add/remove actions");
        if (!friendIds?.length)
          throw new Error("friendIds is required for add/remove actions");

        const results: Array<{ friendId: string; status: string }> = [];
        for (const friendId of friendIds) {
          if (action === "add") {
            await client.friends.addTag(friendId, tagId);
          } else {
            await client.friends.removeTag(friendId, tagId);
          }
          results.push({ friendId, status: "ok" });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ success: true, results }, null, 2),
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
