import fs from "node:fs/promises";

const requiredFields = [
  "id",
  "title",
  "en",
  "department",
  "category",
  "date",
  "lead",
  "clearance",
  "abstract",
  "source",
];
const isText = (value) => typeof value === "string" && value.trim().length > 0;

export function localCoverPath(cover) {
  if (!isText(cover) || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(cover.trim())) return null;
  const path = decodeURIComponent(cover.trim());
  if (path.startsWith("/") || /[\\?#%\x00-\x1f]/.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error("本地相对路径不得以 / 开头、使用路径跳转或包含 URL 控制字符");
  }
  return path;
}

export function validateContent(content) {
  const errors = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("档案数据必须是 JSON 对象。");
  }
  for (const key of ["categories", "columns"]) {
    const names = content[key];
    if (!Array.isArray(names) || names.length !== 5 || !names.every(isText)) {
      errors.push(`${key}：必须包含五个非空分类名称`);
    } else if (new Set(names).size !== 5 || names.includes("全部档案")) {
      errors.push(`${key}：分类名称不能重复，也不能使用“全部档案”`);
    }
  }
  const categories = Array.isArray(content.categories)
    ? content.categories
    : [];
  const columns = Array.isArray(content.columns) ? content.columns : [];
  if (
    categories.some((name) => !columns.includes(name)) ||
    columns.some((name) => !categories.includes(name))
  ) {
    errors.push("categories 与 columns 必须包含相同的五个分类（顺序可以不同）");
  }
  const records = Array.isArray(content.records) ? content.records : [];
  if (records.length !== 40) errors.push("records：当前阵列要求四十份档案");
  const ids = new Set();
  records.forEach((record, index) => {
    const label = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${label}：必须是档案对象`);
      return;
    }
    for (const key of requiredFields) {
      if (!isText(record[key])) errors.push(`${label}.${key}：必须是非空文本`);
    }
    const expectedId = `X-${String(index + 1).padStart(3, "0")}`;
    if (record.id !== expectedId)
      errors.push(`${label}.id：应为 ${expectedId}，编号须按顺序保持稳定`);
    if (ids.has(record.id)) errors.push(`${label}.id：重复编号 ${record.id}`);
    ids.add(record.id);
    if (!categories.includes(record.category))
      errors.push(`${label}.category：未知分类 ${record.category}`);
    if (
      !Array.isArray(record.findings) ||
      record.findings.length === 0 ||
      !record.findings.every(isText)
    ) {
      errors.push(`${label}.findings：必须包含至少一条非空研究记录`);
    }
    try {
      const url = new URL(record.source);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    } catch {
      errors.push(`${label}.source：必须是有效的 HTTP 或 HTTPS 链接`);
    }
    if (record.cover !== undefined) {
      if (!isText(record.cover)) {
        errors.push(`${label}.cover：若填写则必须是非空文本`);
      } else if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(record.cover.trim())) {
        try {
          const coverUrl = new URL(record.cover);
          if (!["https:", "http:"].includes(coverUrl.protocol)) throw new Error();
        } catch {
          errors.push(`${label}.cover：外链封面必须是有效的 HTTP 或 HTTPS 链接`);
        }
      } else {
        try {
          localCoverPath(record.cover);
        } catch (error) {
          errors.push(`${label}.cover：无效的本地封面路径（${error.message}）`);
        }
      }
    }
  });
  for (const name of columns) {
    if (records.filter((record) => record?.category === name).length !== 8) {
      errors.push(`分类“${name}”：当前阵列要求八份档案`);
    }
  }
  if (errors.length)
    throw new Error(`档案数据校验失败：\n- ${errors.join("\n- ")}`);
  return content;
}

export async function loadContent() {
  return validateContent(
    JSON.parse(
      await fs.readFile(
        new URL("../content/archives.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

export function archiveText(r) {
  return `\uFEFFDEEPDEMOS · AI DEMO ARCHIVE\nFILE ${r.id} / ${r.title}\n${r.en}\n\n平台：${r.department}\n收录日期：${r.date}\n作者：${r.lead}\n类型：${r.clearance}\n\n${r.abstract}\n\n作品记录\n${r.findings.map((f, i) => `${i + 1}. ${f}`).join("\n")}\n\n来源：${r.source}\n本文由 deepdemos.top 公开作品信息整理，版权归原作者所有。\n`;
}
