/**
 * 档案卡表面的语义角色。
 *
 * GLB 里的材质名是建模时的临时名字，换一版模型就会全变（旧版 `Frosted_Polymer`，
 * 新版 `Shell_White`）。渲染代码如果按名字分支，换模型时会静默失效：材质覆盖不触发、
 * 阵列白名单全部落空、暗色主题不跟变。这里把名字收敛成角色，渲染只认角色。
 *
 * 新增模型时只需要在 ROLES 里补一行，不用动渲染逻辑。
 */
export type SurfaceRole =
  | "glass" // 半透明盖板，承载解密揭示
  | "acrylic" // 半透明亚克力侧壁，不参与揭示
  | "edge" // 半透明边框（旧模型）
  | "shell" // 不透明白色主体
  | "frame" // 卡面四周的边框条
  | "card" // 卡面印刷层
  | "label" // 小块印刷铭牌
  | "seal" // 框沿上的哑光纸封条
  | "ink" // 纯装饰油墨，不单独出网格
  | "diffuser" // 唯一的投影来源
  | "ceramic" // 内衬
  | "optics" // 内部光学件（无单独覆盖）
  | "optics-body" // 内构玻璃主体
  | "optics-edge" // 内构折边
  | "optics-accent" // 内构强调环
  | "index" // 索引嵌片
  | "index-accent" // 索引强调条
  | "fastener" // 螺丝与垫圈
  | "engrave" // 刻线
  | "other";

const ROLES: Record<string, SurfaceRole> = {
  // 旧模型（archive-cassette.glb）
  Frosted_Polymer: "glass",
  Ivory_Edges: "edge",
  Optical_Diffuser: "diffuser",
  Printed_Label: "label",
  Moulded_Lettering: "label",
  Carbon_Ink: "ink",
  Internal_Ceramic: "ceramic",
  Optical_Edges: "optics-edge",
  Subsurface_Optics: "optics-body",
  Optical_Film: "optics",
  Optical_Film_Edge: "optics",
  Amber_Optical_Inlay: "optics-accent",
  Index_Inlay: "index",
  Champagne_Index: "index-accent",
  Titanium_Fasteners: "fastener",
  Case_Engraving: "engrave",
  Case_Engraving_Highlight: "engrave",
  // 新模型（A 版：单块白板 + 印刷贴纸 + 角落细节）
  Shell_White: "shell",
  A_Frame: "frame",
  CardA_Print: "card",
  A_IndexInlay: "index",
  A_Fastener: "fastener",
  // ref 版（空心亚克力管 + 前后环 + 实心暖色边框）
  REF_Acrylic: "acrylic",
  REF_Glass: "glass",
  REF_FrameMint: "frame",
  REF_FrameMintIn: "frame",
  REF_CardPrint: "card",
  REF_PanelWhite: "shell",
  REF_BackPlate: "shell",
  REF_Steel: "fastener",
  REF_Slot: "fastener",
  REF_Ruler: "engrave",
  REF_FrameInk: "engrave",
  REF_Tape: "engrave",
  REF_SealTape: "seal",
  REF_SealPaper: "label",
};

/** 去掉 Blender 导出的 `.025` 这类重名后缀。 */
export function surfaceName(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\.\d+$/, "");
}

export function surfaceRole(name: string): SurfaceRole {
  return ROLES[name] ?? "other";
}

/**
 * 阵列里保留的角色。40 px 的卡片上，内部光学件、刻线与铭牌都读不出来，
 * 只会增加绘制通道，所以只留结构、可读光学面和实体顶部封条。
 */
export const ARRAY_ROLES: ReadonlySet<SurfaceRole> = new Set<SurfaceRole>([
  "glass",
  "acrylic",
  "edge",
  "shell",
  "frame",
  "card",
  "diffuser",
  "index",
  "seal",
  "fastener",
]);

/** 承载解密揭示的角色。没有这个角色时揭示动画退化为无效果，不报错。 */
export const REVEAL_ROLE: SurfaceRole = "glass";

/** 卡面印刷层。运行时会替换成按档案生成的贴图。 */
export const CARD_ROLE: SurfaceRole = "card";
