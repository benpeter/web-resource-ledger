// tva
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import { copyFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function (eleventyConfig) {
  // Syntax highlighting (Prism, build-time)
  eleventyConfig.addPlugin(syntaxHighlight, {
    init({ Prism }) {
      Prism.languages.mermaid = {}; // passthrough — preserves class for client-side rendering
    },
  });

  // Copy site CSS, JS, and assets
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("assets");

  // Copy design-system.css from src/ into _output/css/
  eleventyConfig.on("eleventy.before", async () => {
    const outDir = path.join(__dirname, "_output", "css");
    mkdirSync(outDir, { recursive: true });
    copyFileSync(
      path.join(__dirname, "..", "src", "design-system.css"),
      path.join(outDir, "design-system.css")
    );
  });

  return {
    dir: {
      input: "content",
      output: "_output",
      includes: "../_includes",
      data: "../_data",
    },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
