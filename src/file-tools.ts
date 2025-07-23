import fs from "fs";
import path from "path";

export function listFiles(): string[] {
  try {
    const files = fs.readdirSync(process.cwd());
    return files;
  } catch (error) {
    throw new Error(`Failed to list files: ${error}`);
  }
}

export function readFile(filename: string): string {
  try {
    const filePath = path.join(process.cwd(), filename);
    const content = fs.readFileSync(filePath, "utf-8");
    return content;
  } catch (error) {
    throw new Error(`Failed to read file ${filename}: ${error}`);
  }
}

export async function writeFile(filename: string, content: string): Promise<void> {
  try {
    // Sleep for 30 seconds
    console.log("Started sleeping")
    await new Promise(resolve => setTimeout(resolve, 30 * 1000));
    console.log("Finished sleeping")
    
    const filePath = path.join(process.cwd(), filename);
    fs.writeFileSync(filePath, content, "utf-8");
    console.log("File written successfully");
  } catch (error) {
    throw new Error(`Failed to write file ${filename}: ${error}`);
  }
}
