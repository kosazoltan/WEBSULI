import { z } from 'zod';

// Schema for HTML error detection response
export const htmlErrorsResponseSchema = z.object({
  fixedHtml: z.string().describe('The corrected HTML code with all errors fixed'),
  errors: z.array(z.object({
    type: z.enum(['syntax', 'semantic', 'accessibility', 'security', 'other']).describe('Type of error found'),
    description: z.string().describe('Detailed description of the error'),
    line: z.number().optional().describe('Line number where error was found (if applicable)'),
    fixed: z.boolean().describe('Whether the error was successfully fixed')
  })).describe('List of all HTML errors found and fixed')
});

// Schema for theme application response
export const themeResponseSchema = z.object({
  themedHtml: z.string().describe('The HTML code with applied color scheme and Material You design'),
  changes: z.array(z.object({
    element: z.string().describe('CSS selector or element type that was changed'),
    change: z.string().describe('Description of the styling change applied')
  })).describe('List of all styling changes applied')
});

// Schema for responsive wrapper response
export const responsiveResponseSchema = z.object({
  fixedHtml: z.string().describe('The HTML code with responsive wrapper and fixes applied'),
  issues: z.array(z.object({
    type: z.enum(['layout', 'viewport', 'images', 'fonts', 'breakpoints', 'other']).describe('Type of responsive issue'),
    description: z.string().describe('Description of the responsive issue found'),
    fixed: z.boolean().describe('Whether the issue was fixed')
  })).optional().describe('List of responsive issues found and fixed')
});

// Type exports for TypeScript
export type HtmlErrorsResponse = z.infer<typeof htmlErrorsResponseSchema>;
export type ThemeResponse = z.infer<typeof themeResponseSchema>;
export type ResponsiveResponse = z.infer<typeof responsiveResponseSchema>;

// Convert Zod schema to Anthropic JSON Schema format
export function zodToAnthropicSchema(schema: z.ZodType): any {
  // For simple implementation, we'll manually define the schemas
  // In production, you might want to use a library like zod-to-json-schema
  return schema;
}

// Anthropic-compatible JSON schemas
// Schema for ChatGPT file analysis response  
export const chatGptFileAnalysisSchema = z.object({
  extractedText: z.string().describe('The complete text content extracted from the PDF or image'),
  suggestedTitle: z.string().describe('Suggested material title based on content'),
  suggestedDescription: z.string().describe('Suggested description summarizing the content'),
  suggestedClassroom: z.number().min(1).max(8).optional().describe('Suggested classroom (1-8) based on content difficulty'),
  topics: z.array(z.string()).describe('List of main topics found in the document')
});

export type ChatGptFileAnalysisResponse = z.infer<typeof chatGptFileAnalysisSchema>;

export const anthropicSchemas = {
  errors: {
    type: "object",
    properties: {
      fixedHtml: {
        type: "string",
        description: "The corrected HTML code with all errors fixed"
      },
      errors: {
        type: "array",
        description: "List of all HTML errors found and fixed",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["syntax", "semantic", "accessibility", "security", "other"],
              description: "Type of error found"
            },
            description: {
              type: "string",
              description: "Detailed description of the error"
            },
            line: {
              type: "number",
              description: "Line number where error was found (if applicable)"
            },
            fixed: {
              type: "boolean",
              description: "Whether the error was successfully fixed"
            }
          },
          required: ["type", "description", "fixed"]
        }
      }
    },
    required: ["fixedHtml", "errors"]
  },
  theme: {
    type: "object",
    properties: {
      themedHtml: {
        type: "string",
        description: "The HTML code with applied color scheme and Material You design"
      },
      changes: {
        type: "array",
        description: "List of all styling changes applied",
        items: {
          type: "object",
          properties: {
            element: {
              type: "string",
              description: "CSS selector or element type that was changed"
            },
            change: {
              type: "string",
              description: "Description of the styling change applied"
            }
          },
          required: ["element", "change"]
        }
      }
    },
    required: ["themedHtml", "changes"]
  },
  responsive: {
    type: "object",
    properties: {
      fixedHtml: {
        type: "string",
        description: "The HTML code with responsive wrapper and fixes applied"
      },
      issues: {
        type: "array",
        description: "List of responsive issues found and fixed",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["layout", "viewport", "images", "fonts", "breakpoints", "other"],
              description: "Type of responsive issue"
            },
            description: {
              type: "string",
              description: "Description of the responsive issue found"
            },
            fixed: {
              type: "boolean",
              description: "Whether the issue was fixed"
            }
          },
          required: ["type", "description", "fixed"]
        }
      }
    },
    required: ["fixedHtml"]
  }
} as const;
