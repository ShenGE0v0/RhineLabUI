// Each identifier also names a local SVG in public/assets/model-providers.
// Match model families rather than release numbers, including the archive's aliases.
const modelProviders = [
  ["deepseek", /^(?:deep-?seek|ds-?v(?=\d)|ds-fv(?=-|$)|v[34](?:-\d+)?-?(?:flash|pro)(?=\d|[-:]|$)|深度求索)/],
  ["openai", /^(?:openai(?=$|-(?:gpt|o\d))|gpt(?=\d|[-:]|$)|chatgpt|o[1345](?=[-:]|$)|codex|sora(?=\d|[-:]|$)|dall-?e|whisper)/],
  ["anthropic", /^(?:anthropic|claude|(?:fable|mythos|sonnet|opus|haiku)(?=-?\d))/],
  ["google", /^(?:google|deepmind|gemini|gemma|imagen|veo(?=\d|[-:]|$)|nano-?banana)/],
  ["xai", /^(?:x-?ai(?=[-:]|$)|grok(?=\d|[-:]|$))/],
  ["zhipu", /^(?:z-?ai(?=[-:]|$)|zhipu|chat-?glm|glm(?=\d|[-:]|$)|cogvideo|cogview|智谱)/],
  ["tencent", /^(?:tencent|hunyuan|hy-?\d+(?=[-:]|$)|混元)/],
  ["alibaba", /^(?:alibaba|aliyun|qwen|qwq(?=[-:]|$)|qvq(?=[-:]|$)|wan(?:-?\d|[-:]|$)|通义|千问|万相)/],
  ["moonshot", /^(?:moonshot|kimi|月之暗面)/],
  ["bytedance", /^(?:byte-?dance|doubao|seedream|seedance|seededit|seed(?:-oss|-?\d)|豆包|即梦)/],
  ["minimax", /^(?:mini-?max|abab(?=\d|[-:]|$)|hailuo|m[123](?=[-:]|$)|海螺)/],
  ["meta", /^(?:meta(?=[-:]|$)|llama|muse-spark)/],
  ["mistral", /^(?:mistral|mixtral|ministral|magistral|codestral|pixtral|devstral|voxtral)/],
  ["baidu", /^(?:baidu|ernie|wenxin|文心)/],
  ["stepfun", /^(?:step-?fun|step-?\d|阶跃)/],
  ["xiaomi", /^(?:xiaomi|mimo(?=\d|[-:]|$)|小米)/],
  ["nvidia", /^(?:nvidia|nemotron)/],
  ["microsoft", /^(?:microsoft|phi(?=\d|[-:]|$)|mai-(?:ds|image|voice|transcribe))/],
  ["aws", /^(?:amazon|aws(?=[-:]|$)|nova(?:-?\d|-(?:micro|lite|pro|premier|canvas|reel|sonic|act))|titan-(?:text|image|embed))/],
  ["cohere", /^(?:cohere|command-(?:a|r|light|nightly)(?=[-:]|$)|aya(?=[-:]|$))/],
  ["perplexity", /^(?:perplexity|sonar(?=[-:]|$))/],
  ["ibm", /^(?:ibm(?=[-:]|$)|granite(?=[-:\d]|$))/],
  ["ai21", /^(?:ai21|jamba)/],
  ["yi", /^(?:01-?ai|lingyiwanwu|yi(?=\d|[-:]|$)|零一万物)/],
  ["baichuan", /^(?:baichuan|百川)/],
  ["stability", /^(?:stability|stable-(?:diffusion|image|audio)|sdxl|sd-?[123](?=[-:]|$))/],
  ["bfl", /^(?:bfl(?=[-:]|$)|black-forest-labs|flux(?=\d|[-:]|$))/],
  ["midjourney", /^(?:mid-?journey|niji(?=\d|[-:]|$))/],
  ["kling", /^(?:kuaishou|kling(?=\d|[-:]|$)|可灵)/],
  ["runway", /^(?:runway|gen-[34](?=[-:]|$))/],
  ["suno", /^(?:suno|chirp(?=[-:]|$))/],
  ["adobe", /^(?:adobe|firefly)/],
  ["sensenova", /^(?:sensetime|sensenova|商汤)/],
  ["spark", /^(?:iflytek|spark-(?:desk|max|x\d)|讯飞|星火)/],
  ["apple", /^(?:apple|afm)(?=[-:]|$)/],
] as const;

export type ModelProvider = (typeof modelProviders)[number][0];

export function modelProvider(model: string): ModelProvider | undefined {
  const segments = model.trim().toLowerCase().split("/");
  // A family name takes precedence over a hosting or routing namespace.
  for (const part of [segments.at(-1), segments.at(-2)]) {
    if (!part) continue;
    const name = part.trim().replace(/[\s_.]+/g, "-");
    const provider = modelProviders.find(([, pattern]) => pattern.test(name));
    if (provider) return provider[0];
  }
}
