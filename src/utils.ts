import prompts from "prompts";

export async function ask(message: string, type: prompts.PromptType = "text"): Promise<string> {
  return (await prompts({ type, name: "ask", message })).ask;
}