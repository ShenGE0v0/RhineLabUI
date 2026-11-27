import type {
  MeshStandardMaterial,
  WebGLProgramParametersWithUniforms,
} from "three";
import type { SurfaceRole } from "./archive-surfaces";

const sealFillMaterials = new WeakSet<MeshStandardMaterial>();

/** Lift the dark top seal in the light overview without flattening its folds.
 *  The authored selected seal remains the reference, so brighter fragments
 *  receive no additional color. Non-instanced materials also fade the lift by
 *  Appearance's archiveQuality, restoring the original seal at full lift.
 *  Fog still runs after this local fill. */
export function installOverviewSealFill(
  material: MeshStandardMaterial,
  bottomLight: { value: number },
  useAppearanceQuality = false,
) {
  if (sealFillMaterials.has(material)) return;
  sealFillMaterials.add(material);
  const before = material.onBeforeCompile;
  const cache = material.customProgramCacheKey.bind(material)();
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    const appearanceQuality = useAppearanceQuality
      ? shader.uniforms.archiveQuality
      : undefined;
    const appearanceFade = useAppearanceQuality
      ? appearanceQuality
        ? "sealFill *= 1.0 - archiveQuality;"
        : "sealFill = 0.0;"
      : "";
    shader.uniforms.archiveBottomLight = bottomLight;
    shader.vertexShader =
      "varying vec3 vOverviewSealNormal;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvOverviewSealNormal = objectNormal;",
    );
    shader.fragmentShader =
      "uniform float archiveBottomLight;\n" +
      "varying vec3 vOverviewSealNormal;\n" +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
      float sealLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
      vec3 sealNormal = normalize(vOverviewSealNormal);
      float sealFold =
        0.94 +
        0.04 * smoothstep(-0.8, 0.8, sealNormal.y) +
        0.02 * smoothstep(-0.8, 0.8, abs(sealNormal.z));
      float sealLit = smoothstep(0.02, 0.16, sealLuma);
      vec3 sealWarm = mix(
        vec3(0.42, 0.31, 0.22),
        vec3(0.60, 0.46, 0.35),
        sealLit
      ) * sealFold;
      float sealTargetLuma = dot(sealWarm, vec3(0.2126, 0.7152, 0.0722));
      float sealWindow = 1.0 - smoothstep(0.55, 0.82, sealLuma);
      float sealNeed = smoothstep(0.0, 0.06, sealTargetLuma - sealLuma);
      float sealFill = 0.88 * archiveBottomLight * sealWindow * sealNeed;
      ${appearanceFade}
      vec3 filledLight = mix(
        outgoingLight,
        sealWarm,
        sealFill
      );
      outgoingLight += max(filledLight - outgoingLight, vec3(0.0));
      ${
        useAppearanceQuality
          ? ""
          : "outgoingLight = mix(outgoingLight, min(outgoingLight, sealWarm * 1.12), archiveBottomLight);"
      }
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () =>
    `${cache}-archive-overview-seal-fill`;
  material.needsUpdate = true;
}

/** Small details drawn in cassette coordinates so they stay attached as the
 *  rows move. The accent only runs on the light archive overview. */
export function applyOverviewLook(
  shader: WebGLProgramParametersWithUniforms,
  role: SurfaceRole,
  badge: WebGLProgramParametersWithUniforms["uniforms"][string] | undefined,
  hoverBadge?: { instance: { value: number }; heightFraction: number },
  selectedHeadingEdge?: { value: number },
  selectedBadgeHeightFraction?: { value: number },
  slotProximity?: WebGLProgramParametersWithUniforms["uniforms"][string],
) {
  if (role !== "glass" && role !== "acrylic" && role !== "frame" &&
      role !== "shell" && role !== "card" && role !== "engrave") return;

  if (slotProximity) {
    shader.uniforms.archiveSlotProximity = slotProximity;
  }
  const slotProximityExpr = slotProximity ? "archiveSlotProximity" : "1.0";

  shader.vertexShader =
    "varying vec3 vOverviewPosition; varying vec3 vOverviewNormal;\n" +
    shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvOverviewPosition = position; vOverviewNormal = objectNormal;",
    );
  shader.fragmentShader =
    "varying vec3 vOverviewPosition; varying vec3 vOverviewNormal;\n" +
    shader.fragmentShader;
  // Structural frames keep their quiet overview compression. Broad optical
  // and backing planes now carry the light without the former global dimming.
  const overviewBodyCompression = role === "frame" ? 0.76 : 1.0;
  let finish = `
    vec3 overviewNormal = normalize(vOverviewNormal);
    vec3 overviewLuma = vec3(0.2126, 0.7152, 0.0722);
    float topFacing = smoothstep(0.3, 0.95, overviewNormal.y);
    float endFacing = smoothstep(0.25, 0.9, abs(overviewNormal.x));
    float faceFacing = smoothstep(0.4, 0.92, abs(overviewNormal.z));
    float tip = 1.0 - smoothstep(0.0, 0.26, abs(vOverviewPosition.x + 2.48));
    float lip = smoothstep(3.38, 3.71, vOverviewPosition.y);
    float opticalLocalHeight = clamp(vOverviewPosition.y / 3.7, 0.0, 1.0);
    float leftEndBias = mix(
      0.08,
      1.0,
      smoothstep(-0.35, 0.35, -vOverviewPosition.x)
    );
    float slotDirect =
      clamp(vArchiveSlotLight, 0.0, 1.0) * archiveSlotLightGain;
    float slotProximity = ${slotProximityExpr};
    float slotNeighbor =
      clamp(vArchiveSlotReflection, 0.0, 1.0) * archiveSlotLightGain;
    float slotTopRail =
      clamp(vArchiveSlotTopRail, 0.0, 1.0) * archiveSlotLightGain;
    float slotTopRailClamped = clamp(vArchiveSlotTopRail, 0.0, 1.0);
    float slotTopRailPrimary =
      (slotTopRailClamped > 0.0001 ? pow(slotTopRailClamped, 1.35) : 0.0) *
      archiveSlotLightGain;
    float slotLateral =
      clamp(abs(vArchiveSlotLateral), 0.0, 1.0) * archiveSlotLightGain;
    float towardSourceDir = clamp(vArchiveSlotLateral / 0.12, -1.0, 1.0);
    float towardSourceX = vOverviewPosition.x * towardSourceDir;
    float topRailFaceVertical =
      pow(smoothstep(1.20, 3.56, vOverviewPosition.y), 1.15);
    float topRailGapWeight =
      mix(0.84, 1.15, smoothstep(-1.90, 2.38, towardSourceX));
    float topRailFaceSpill =
      clamp(slotTopRail * topRailFaceVertical * topRailGapWeight, 0.0, 1.20);
    float activeCardProtection =
      clamp(max(slotDirect, 0.92 * topRailFaceSpill), 0.0, 1.0);
    // Quiet only the upward normals. The vertical end columns retain their
    // previous fill so the side bars do not return to gray-black seams.
    float topWarm = topFacing * 0.24;
    float endWarm = endFacing * 0.22;
    float warmEdge = max(topWarm, endWarm);
    float overviewUnselectedBody =
      archiveBottomLight * faceFacing *
      (1.0 - activeCardProtection);
    float overviewBodyFillScale =
      mix(1.0, 0.84, overviewUnselectedBody);
    float overviewBodyShade = max(faceFacing, topFacing * 0.45);
    outgoingLight *= mix(
      1.0,
      ${overviewBodyCompression.toFixed(2)},
      overviewBodyShade * archiveBottomLight * (1.0 - 0.65 * activeCardProtection)
    );
  `;
  if (role === "frame" || role === "engrave") {
    finish += `
      float upperBand = smoothstep(3.44, 3.68, vOverviewPosition.y) * faceFacing;
      vec3 pearl = vec3(0.92, 0.74, 0.58);
      outgoingLight = mix(outgoingLight, pearl, archiveBottomLight * max(0.20 * upperBand, 0.16 * warmEdge));
      outgoingLight += archiveBottomLight * (
        vec3(0.08, 0.06, 0.04) * warmEdge +
        vec3(0.19, 0.13, 0.075) * tip * lip * faceFacing
      );
      float frameLeftPillar =
        leftEndBias * smoothstep(2.22, 2.38, -vOverviewPosition.x);
      float frameDirectBand =
        leftEndBias * smoothstep(1.30, 2.05, -vOverviewPosition.x);
      // The raised selected card emerges above the lower-left neighbor around
      // local y = 1.65..2.25 (opticalLocalHeight = 0.45..0.61), so keep rich
      // slot warmth at the bottom and taper cleanly below the badge (y = 2.87).
      float frameDirectRaw = 1.0 - smoothstep(0.42, 0.74, opticalLocalHeight);
      float frameDirectHeight =
        frameDirectRaw > 0.0001 ? pow(frameDirectRaw, 1.35) : 0.0;
      // Unextracted neighbor cards expose local y = 2.25..3.70 above the
      // adjacent column. Anchor their vertical taper across that visible band.
      float frameNeighborHeight =
        (1.0 - 0.30 * smoothstep(0.58, 0.93, opticalLocalHeight)) *
        (1.0 - smoothstep(0.93, 0.985, opticalLocalHeight));
      float frameLateralRight =
        smoothstep(0.55, 2.46, towardSourceX) *
        (0.50 + 0.50 * (1.0 - smoothstep(0.10, 0.88, opticalLocalHeight)));
      float frameLitSuppression = clamp(
        slotDirect * (0.50 + 0.50 * frameLeftPillar) +
        slotNeighbor * frameLeftPillar * frameNeighborHeight * 0.95 +
        slotTopRail * smoothstep(3.15, 3.66, vOverviewPosition.y) +
        slotLateral * frameLateralRight * 0.90,
        0.0, 1.0
      );
      // The dark side bars are the front-facing narrow FrameMint / FrameMintIn
      // strips, not the backing plate. Suppress that dark fill wherever the
      // slot lamp or top-rail spill illuminates the frame rim.
      float endStrip = smoothstep(2.22, 2.34, abs(vOverviewPosition.x));
      float topFade = 1.0 - smoothstep(3.50, 3.56, vOverviewPosition.y);
      float verticalTone = mix(
        1.0,
        0.88,
        smoothstep(0.20, 3.45, vOverviewPosition.y)
      );
      float frameFacing = max(faceFacing, endFacing * 0.86);
      float frameEdgeFill =
        frameFacing * endStrip * topFade * verticalTone *
        (1.0 - frameLitSuppression);
      float frameBaseLuma = dot(outgoingLight, overviewLuma);
      outgoingLight = mix(
        outgoingLight,
        vec3(0.60, 0.50, 0.38),
        0.30 * archiveBottomLight * frameEdgeFill
      );
      outgoingLight += vec3(0.10, 0.072, 0.042) *
        archiveBottomLight * frameEdgeFill;
      float frameDarkDeficit =
        1.0 - smoothstep(0.22, 0.46, frameBaseLuma);
      outgoingLight = mix(
        outgoingLight,
        vec3(0.62, 0.53, 0.41),
        0.10 * archiveBottomLight * frameEdgeFill * frameDarkDeficit
      );
      // Warm ivory lift across the raised selected card's upper/right frame,
      // and rich golden-peach spill rising up its lower-left slot pillar.
      outgoingLight = mix(
        outgoingLight,
        vec3(0.92, 0.84, 0.75),
        0.42 * archiveBottomLight * slotDirect * frameFacing
      );
      float frameDirectSlot =
        slotDirect * slotProximity * frameDirectHeight *
        max(frameLeftPillar * endFacing, frameDirectBand * faceFacing);
      float frameEdgeTone =
        clamp(endFacing / max(endFacing + faceFacing, 0.001), 0.0, 1.0);
      vec3 frameDirectTarget = mix(
        vec3(1.20, 0.64, 0.22),
        vec3(1.18, 0.76, 0.34),
        frameEdgeTone
      );
      outgoingLight = mix(
        outgoingLight,
        frameDirectTarget,
        clamp(0.84 * archiveBottomLight * frameDirectSlot, 0.0, 0.84)
      );
      // Same-column 12-13 card luminous -X end-wall cascade (row + 1 .. row + 13).
      float frameNeighborEdge =
        leftEndBias * max(
          endFacing * smoothstep(2.26, 2.40, -vOverviewPosition.x),
          faceFacing * smoothstep(2.30, 2.46, -vOverviewPosition.x) * 0.62
        );
      float frameCascadeHeight =
        (0.74 + 0.26 * (1.0 - smoothstep(0.28, 0.82, opticalLocalHeight))) *
        (1.0 - 0.52 * smoothstep(0.84, 0.985, opticalLocalHeight));
      float frameCascadeWarm = 1.0 - smoothstep(0.32, 0.78, opticalLocalHeight);
      float frameCascadeNear = smoothstep(0.06, 0.88, slotNeighbor);
      float frameNeighborCurve = slotNeighbor > 0.0001 ? pow(slotNeighbor, 0.70) : 0.0;
      vec3 frameCascadeTop = mix(vec3(0.84, 0.62, 0.42), vec3(1.18, 0.98, 0.80), frameCascadeNear);
      vec3 frameCascadeBot = mix(vec3(0.92, 0.64, 0.40), vec3(1.24, 0.94, 0.68), frameCascadeNear);
      vec3 frameNeighborTarget = mix(frameCascadeTop, frameCascadeBot, frameCascadeWarm);
      float frameNeighborWeight =
        clamp(0.80 * archiveBottomLight * frameNeighborCurve * frameNeighborEdge * frameCascadeHeight, 0.0, 0.84);
      outgoingLight = mix(outgoingLight, frameNeighborTarget, frameNeighborWeight);
      float frameEndProtection = frameNeighborEdge * smoothstep(0.06, 0.62, slotNeighbor);
      float frameSubsurfaceMask =
        archiveBottomLight * (1.0 - activeCardProtection) *
        (1.0 - frameEndProtection);
      outgoingLight *= mix(vec3(1.0), vec3(0.76, 0.60, 0.45), frameSubsurfaceMask * 0.82);
      // Neighbor cassette along the active row: keep the front-facing top frame
      // bevel in warm peach-amber below the bright upward-facing top rail line.
      float frameTopBridgeLong =
        1.0 - smoothstep(2.36, 2.48, abs(vOverviewPosition.x));
      float frameTopBevelHeight =
        smoothstep(3.40, 3.64, vOverviewPosition.y);
      float frameTopEdgeLine =
        smoothstep(3.64, 3.70, vOverviewPosition.y) *
        smoothstep(0.18, 0.80, overviewNormal.y);
      float frameTopBridge =
        frameTopBridgeLong * frameTopBevelHeight;
      float frameLateralGlow =
        slotLateral * frameLateralRight * frameFacing;
      vec3 frameSpillTarget = mix(
        vec3(1.06, 0.58, 0.34),
        vec3(1.24, 0.46, 0.16),
        smoothstep(-1.0, 2.35, towardSourceX)
      );
      float frameSpillMix = clamp(
        0.86 * frameTopBridge * slotTopRail + 0.65 * frameLateralGlow,
        0.0, 0.92
      );
      outgoingLight = mix(
        outgoingLight,
        frameSpillTarget,
        archiveBottomLight * frameSpillMix
      );
      outgoingLight = mix(
        outgoingLight,
        vec3(1.75, 0.92, 0.34),
        archiveBottomLight * clamp(
          frameTopBridgeLong * frameTopEdgeLine * (0.85 * slotTopRailPrimary + 0.25 * slotLateral),
          0.0, 0.92
        )
      );
      // A shallow circular recess with a narrow champagne bevel. fwidth
      // keeps the relief stable where the fastener is only a few pixels wide.
      vec2 head = vec2(abs(vOverviewPosition.x) - 2.37, vOverviewPosition.y - 3.59);
      float radius = length(head);
      float aa = clamp(fwidth(radius), 0.004, 0.027);
      float disk = (1.0 - smoothstep(0.047 - aa, 0.047 + aa, radius)) * faceFacing;
      float edge = smoothstep(0.025, 0.043, radius);
      float glint = smoothstep(-0.55, 0.55, dot(normalize(head + vec2(0.00001)), vec2(-0.62, 0.78)));
      vec3 metal = mix(vec3(0.32, 0.25, 0.18), vec3(1.38, 1.20, 0.91), edge * glint);
      float slot = (1.0 - smoothstep(0.004, 0.012, abs(head.x + 0.45 * head.y))) *
        (1.0 - smoothstep(0.013, 0.024, radius));
      outgoingLight = mix(outgoingLight, metal * (1.0 - slot * 0.75), disk * archiveBottomLight);
    `;
  } else if (role === "acrylic" || role === "glass") {
    finish += `
      float shoulder = smoothstep(2.85, 3.61, vOverviewPosition.y);
      float grazing = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      float shoulderGlow =
        (0.12 + 0.15 * grazing) * shoulder * faceFacing;
      outgoingLight += vec3(0.08, 0.058, 0.036) * archiveBottomLight *
        (warmEdge + shoulderGlow + 0.18 * tip);
      float lowFill = 0.42 * overviewBodyFillScale * (
        1.0 - smoothstep(0.13, 0.45, dot(outgoingLight, overviewLuma))
      ) * (1.0 - 0.82 * activeCardProtection);
      outgoingLight = mix(
        outgoingLight,
        vec3(0.58, 0.41, 0.28),
        lowFill * faceFacing * archiveBottomLight
      );
      // Lift the raised selected card's glass cover toward clean warm ivory.
      outgoingLight = mix(
        outgoingLight,
        vec3(0.94, 0.87, 0.79),
        0.26 * archiveBottomLight * slotDirect * faceFacing
      );
    `;
    if (role === "acrylic") {
      finish += `
        float acrylicEdgeBand =
          smoothstep(2.20, 2.34, abs(vOverviewPosition.x));
        float acrylicEdgeFacing = max(faceFacing, endFacing * 0.84);
        float acrylicEdgeHeight =
          1.0 - smoothstep(3.50, 3.70, vOverviewPosition.y);
        outgoingLight += vec3(0.18, 0.14, 0.10) * 0.18 *
          archiveBottomLight * acrylicEdgeBand *
          acrylicEdgeFacing * acrylicEdgeHeight;
      `;
    }
    const topDirectFinal = role === "glass" ? 0.120 : 0.220;
    const topSpillFinal = role === "glass" ? 0.620 : 0.980;
    const topReflectionFinal = role === "glass" ? 0.032 : 0.042;
    const topShoulderDirectFinal = role === "glass" ? 0.035 : 0.055;
    const topShoulderSpillFinal = role === "glass" ? 0.140 : 0.220;
    const topShoulderReflectionFinal = role === "glass" ? 0.010 : 0.014;
    const topLateralCoreFinal = role === "glass" ? 0.140 : 0.190;
    const topLateralShoulderFinal = role === "glass" ? 0.040 : 0.060;
    const upperInnerDirectFinal = role === "glass" ? 0.030 : 0.045;
    const upperInnerSpillFinal = role === "glass" ? 0.075 : 0.110;
    const upperInnerReflectionFinal = role === "glass" ? 0.008 : 0.012;
    const directEdgeStart = role === "glass" ? 2.18 : 2.16;
    const directEdgeEnd = role === "glass" ? 2.38 : 2.42;
    const reflectedEndColor = role === "glass"
      ? "vec3(0.16, 0.12, 0.08)"
      : "vec3(0.32, 0.23, 0.15)";
    const reflectedEndSurface = role === "glass"
      ? "leftEndBias * faceFacing * smoothstep(2.26, 2.38, -vOverviewPosition.x)"
      : "leftEndBias * opticalVertical";
    finish += `
      float opticalHorizontal =
        smoothstep(0.68, 0.94, abs(overviewNormal.y));
      float opticalVertical = smoothstep(0.32, 0.88, endFacing);
      float opticalRim = smoothstep(0.62, 0.94, faceFacing);
      float directBottom =
        1.0 - smoothstep(0.02, 0.24, opticalLocalHeight);
      float directEdgeZone =
        leftEndBias *
        smoothstep(${directEdgeStart.toFixed(2)}, ${directEdgeEnd.toFixed(2)},
          abs(vOverviewPosition.x));
      float directFrontZone =
        leftEndBias *
        smoothstep(1.25, 2.02, -vOverviewPosition.x) *
        faceFacing;
      float directFrontRaw = 1.0 - smoothstep(0.42, 0.74, opticalLocalHeight);
      float directFrontFall =
        directFrontRaw > 0.0001 ? pow(directFrontRaw, 1.35) : 0.0;
      float directEdgeFall =
        (1.0 - 0.15 * smoothstep(0.25, 0.58, opticalLocalHeight)) *
        (1.0 - smoothstep(0.58, 0.78, opticalLocalHeight));
      float directFrontMask = clamp(
        directFrontZone * directFrontFall + 0.22 * directBottom * faceFacing,
        0.0, 1.0
      );
      outgoingLight = mix(
        outgoingLight,
        vec3(1.20, 0.64, 0.22),
        clamp(0.78 * archiveBottomLight * slotDirect * slotProximity * directFrontMask, 0.0, 0.78)
      );
      outgoingLight = mix(
        outgoingLight,
        vec3(1.18, 0.76, 0.34),
        clamp(
          0.82 * archiveBottomLight * slotDirect * slotProximity *
            directEdgeZone * opticalVertical * directEdgeFall,
          0.0, 0.82
        )
      );

      float reflectionHeight =
        (0.74 + 0.26 * (1.0 - smoothstep(0.28, 0.82, opticalLocalHeight))) *
        (1.0 - 0.52 * smoothstep(0.84, 0.985, opticalLocalHeight));
      float reflectionSurface = max(
        opticalVertical,
        max(
          opticalRim * smoothstep(2.30, 2.46, -vOverviewPosition.x) * 0.52,
          opticalHorizontal * 0.22
        )
      );
      float reflectionWarm = 1.0 - smoothstep(0.32, 0.78, opticalLocalHeight);
      float reflectionNear = smoothstep(0.06, 0.88, slotNeighbor);
      float reflectionCurve = slotNeighbor > 0.0001 ? pow(slotNeighbor, 0.70) : 0.0;
      vec3 glassCascadeTop = mix(vec3(0.84, 0.62, 0.42), vec3(1.18, 0.98, 0.80), reflectionNear);
      vec3 glassCascadeBot = mix(vec3(0.92, 0.64, 0.40), vec3(1.24, 0.94, 0.68), reflectionNear);
      vec3 glassNeighborTarget = mix(glassCascadeTop, glassCascadeBot, reflectionWarm);
      outgoingLight = mix(
        outgoingLight,
        glassNeighborTarget,
        clamp(
          0.78 * archiveBottomLight * reflectionCurve *
            directEdgeZone * reflectionSurface * reflectionHeight,
          0.0, 0.82
        )
      );

      // The exposed acrylic end and outer left rim carry the vertical slot
      // reflection; the recessed glass window steps down to warm amber-brown.
      float reflectedEndHeight = reflectionHeight;
      float slotNeighborPow = slotNeighbor > 0.0001 ? pow(slotNeighbor, 0.85) : 0.0;
      outgoingLight += ${reflectedEndColor} *
        (${reflectedEndSurface}) * reflectedEndHeight *
        archiveBottomLight *
        slotNeighborPow;
      float opticalSubsurfaceEdge = max(
        endFacing,
        faceFacing * smoothstep(2.22, 2.48, -vOverviewPosition.x)
      );
      float opticalSubsurfaceMask =
        archiveBottomLight * opticalSubsurfaceEdge * (1.0 - activeCardProtection) *
        (1.0 - smoothstep(0.06, 0.62, slotNeighbor));
      outgoingLight *= mix(vec3(1.0), vec3(0.76, 0.60, 0.45), opticalSubsurfaceMask * 0.82);

      float lateralAmount =
        smoothstep(0.04, 0.22, abs(vArchiveSlotLateral));
      float lateralSide =
        smoothstep(0.45, 2.46, towardSourceX);
      float lateralSurface = max(
        opticalVertical,
        max(opticalRim * 0.92, opticalHorizontal * 0.85)
      );
      float lateralVerticalHeight =
        (0.62 + 0.38 * (1.0 - smoothstep(0.10, 0.82, opticalLocalHeight))) *
        (1.0 - smoothstep(0.88, 1.0, opticalLocalHeight));
      float lateralTopHeight =
        0.62 + 0.38 * (1.0 - smoothstep(0.12, 0.95, opticalLocalHeight));
      float lateralHeight = mix(
        lateralVerticalHeight,
        lateralTopHeight,
        opticalHorizontal
      );
      float lateralMask = clamp(
        lateralAmount * lateralSide * lateralSurface * lateralHeight,
        0.0, 1.0
      );
      // Neighbor cassette along the active row: warm peach-amber upper-face
      // wash spilling down from the lit top rail across the front glass.
      vec3 glassSpillTarget = mix(
        vec3(1.06, 0.58, 0.34),
        vec3(1.24, 0.46, 0.16),
        smoothstep(-1.0, 2.35, towardSourceX)
      );
      float glassSpillMix = clamp(
        0.84 * topRailFaceSpill * faceFacing + 0.52 * lateralMask,
        0.0, 0.92
      );
      outgoingLight = mix(
        outgoingLight,
        glassSpillTarget,
        archiveBottomLight * glassSpillMix
      );
    `;
    if (role === "glass") {
      finish += `
        float glassInnerEdgeBand =
          smoothstep(2.06, 2.18, abs(vOverviewPosition.x)) *
          (1.0 - smoothstep(2.32, 2.40, abs(vOverviewPosition.x)));
        float glassInnerEdgeFade =
          1.0 - smoothstep(3.52, 3.68, vOverviewPosition.y);
        float glassEdgeLuma = dot(outgoingLight, overviewLuma);
        float glassDarkDeficit =
          1.0 - smoothstep(0.24, 0.48, glassEdgeLuma);
        outgoingLight = mix(
          outgoingLight,
          vec3(0.60, 0.52, 0.41),
          0.095 * archiveBottomLight * faceFacing *
            glassInnerEdgeBand * glassInnerEdgeFade * glassDarkDeficit
        );
        float glassLocalHeight = clamp(vOverviewPosition.y / 3.7, 0.0, 1.0);
        float glassWarmBody = pow(max(1.0 - glassLocalHeight, 0.0), 1.55) *
          (0.72 + 0.28 * (1.0 - smoothstep(0.04, 0.38, glassLocalHeight)));
        outgoingLight = mix(
          outgoingLight,
          outgoingLight * vec3(1.0, 0.88, 0.72),
          0.22 * glassWarmBody * faceFacing *
            archiveBottomLight * slotDirect * slotProximity
        );
      `;
    }
    finish += `
      // Approximate linear HDR transmission through the optical body. The
      // upward normal isolates the long top rail and its bevel, while the
      // height and x masks fade near the ends.
      float topRailLong =
        1.0 - smoothstep(2.36, 2.48, abs(vOverviewPosition.x));
      float topRailCoreFacing =
        smoothstep(0.58, 0.94, overviewNormal.y);
      float topRailCoreHeight =
        smoothstep(3.48, 3.69, vOverviewPosition.y);
      float topRailVariation =
        0.92 + 0.08 * (
          0.62 * (0.5 + 0.5 * sin(vOverviewPosition.x * 3.7 + 0.6)) +
          0.38 * (0.5 + 0.5 * cos(vOverviewPosition.x * 1.9 - 0.4))
        );
      float topRailCore =
        topRailLong * topRailCoreFacing *
        topRailCoreHeight * topRailVariation;
      float topRailShoulderFacing =
        smoothstep(0.08, 0.68, overviewNormal.y);
      float topRailShoulderHeight =
        smoothstep(3.32, 3.60, vOverviewPosition.y);
      float topRailShoulder =
        topRailLong * topRailShoulderFacing * topRailShoulderHeight *
        (1.0 - 0.62 * topRailCoreFacing);
      float topDirect = slotDirect * slotProximity;
      float topNeighbor = slotNeighbor;
      float topRailSpill = slotTopRailPrimary;
      float topLateralAmount =
        pow(clamp(abs(vArchiveSlotLateral), 0.0, 1.0), 2.0);
      float topLateralTaper = mix(
        0.45,
        1.0,
        smoothstep(0.10, 2.30, towardSourceX)
      );
      float topLateral =
        topLateralAmount * topLateralTaper * archiveSlotLightGain;
      outgoingLight = mix(
        outgoingLight,
        vec3(1.75, 0.92, 0.34),
        archiveBottomLight * clamp(topRailCore * (0.85 * topRailSpill + 0.22 * topLateral), 0.0, 0.94)
      );
      outgoingLight += archiveBottomLight * (
        topRailCore * (
          vec3(1.0, 0.88, 0.72) * 0.004 +
          vec3(1.0, 0.82, 0.52) * ${topDirectFinal.toFixed(3)} * topDirect +
          vec3(1.0, 0.84, 0.58) * ${topReflectionFinal.toFixed(3)} *
            topNeighbor +
          vec3(1.0, 0.78, 0.32) * ${topSpillFinal.toFixed(3)} *
            topRailSpill +
          vec3(1.0, 0.74, 0.30) * ${topLateralCoreFinal.toFixed(3)} *
            topLateral
        ) +
        topRailShoulder * (
          vec3(1.0, 0.84, 0.56) * ${topShoulderDirectFinal.toFixed(3)} *
            topDirect +
          vec3(1.0, 0.86, 0.64) * ${topShoulderReflectionFinal.toFixed(3)} *
            topNeighbor +
          vec3(1.0, 0.68, 0.30) * ${topShoulderSpillFinal.toFixed(3)} *
            topRailSpill +
          vec3(1.0, 0.66, 0.28) * ${topLateralShoulderFinal.toFixed(3)} *
            topLateral
        )
      );
      // Keep a subtle warm face-facing shoulder right below the top bar.
      float upperInnerLong =
        1.0 - smoothstep(2.24, 2.44, abs(vOverviewPosition.x));
      float upperInnerRise =
        smoothstep(3.32, 3.56, vOverviewPosition.y);
      float upperInnerPeak =
        0.65 + 0.35 * smoothstep(3.45, 3.56, vOverviewPosition.y);
      float upperInnerFace =
        upperInnerLong * faceFacing * upperInnerRise * upperInnerPeak;
      outgoingLight += archiveBottomLight * upperInnerFace * (
        vec3(1.0, 0.84, 0.58) * ${upperInnerDirectFinal.toFixed(3)} *
          topDirect +
        vec3(1.0, 0.86, 0.64) * ${upperInnerReflectionFinal.toFixed(3)} *
          topNeighbor +
        vec3(1.0, 0.64, 0.28) * ${upperInnerSpillFinal.toFixed(3)} *
          topRailSpill
      );
    `;
  } else {
    finish += `
      float height = smoothstep(1.55, 3.65, vOverviewPosition.y);
      vec3 warmBacking = mix(
        vec3(0.56, 0.39, 0.26),
        vec3(0.78, 0.59, 0.44),
        height
      );
      outgoingLight = mix(
        outgoingLight,
        warmBacking,
        0.32 * faceFacing * archiveBottomLight * overviewBodyFillScale *
          (1.0 - 0.78 * activeCardProtection)
      );
      // Raised selected card: lift backing panel & card print toward clean
      // warm ivory, with a warm golden-peach slot glow at the lower-left.
      outgoingLight = mix(
        outgoingLight,
        vec3(0.95, 0.88, 0.80),
        0.42 * faceFacing * archiveBottomLight * slotDirect
      );
      float backingDirectRaw = 1.0 - smoothstep(0.42, 0.74, opticalLocalHeight);
      float backingDirectFall =
        backingDirectRaw > 0.0001 ? pow(backingDirectRaw, 1.35) : 0.0;
      float backingLeftDirect =
        leftEndBias *
        smoothstep(1.25, 2.02, -vOverviewPosition.x) *
        backingDirectFall;
      outgoingLight = mix(
        outgoingLight,
        vec3(1.20, 0.64, 0.22),
        clamp(0.82 * faceFacing * archiveBottomLight * slotDirect * slotProximity * backingLeftDirect, 0.0, 0.84)
      );
      // Same-column front/back neighbors: keep the recessed panel inside the
      // frame in warm amber-brown, with only a narrow outer left rim transition.
      float backingLeftPillar =
        leftEndBias *
        smoothstep(2.26, 2.38, -vOverviewPosition.x) *
        (1.0 - 0.30 * smoothstep(0.58, 0.93, opticalLocalHeight)) *
        (1.0 - smoothstep(0.93, 0.985, opticalLocalHeight));
      vec3 backingNeighborTarget = mix(
        vec3(0.76, 0.62, 0.48),
        vec3(0.96, 0.74, 0.50),
        1.0 - smoothstep(0.58, 0.92, opticalLocalHeight)
      );
      outgoingLight = mix(
        outgoingLight,
        backingNeighborTarget,
        clamp(0.20 * faceFacing * archiveBottomLight * slotNeighbor * backingLeftPillar, 0.0, 0.26)
      );
      // Neighbor cassette along the active row: warm peach-amber wash across
      // the upper front face and gap-facing corner behind the glass cover.
      float backingLateralRight =
        smoothstep(0.55, 2.42, towardSourceX) *
        (0.50 + 0.50 * (1.0 - smoothstep(0.10, 0.90, opticalLocalHeight)));
      float backingWarmSpill = clamp(
        0.86 * topRailFaceSpill + 0.56 * slotLateral * backingLateralRight,
        0.0, 0.92
      );
      vec3 backingSpillTarget = mix(
        vec3(1.06, 0.58, 0.34),
        vec3(1.24, 0.46, 0.16),
        smoothstep(-1.0, 2.35, towardSourceX)
      );
      outgoingLight = mix(
        outgoingLight,
        backingSpillTarget,
        faceFacing * archiveBottomLight * backingWarmSpill
      );
    `;
  }
  if (
    role === "glass" ||
    role === "acrylic" ||
    role === "shell" ||
    role === "card"
  ) {
    const bodyScale =
      role === "glass"
        ? 0.69
        : role === "acrylic"
          ? 0.72
          : 0.74;
    finish += `
      // Final overview body compression leaves the two end columns, horizontal
      // rims, the selected card and the top-rail-lit neighbor untouched.
      float overviewBodyWidth =
        1.0 - smoothstep(2.26, 2.40, abs(vOverviewPosition.x));
      float overviewBodyDarken =
        archiveBottomLight * faceFacing *
        (1.0 - activeCardProtection) *
        overviewBodyWidth;
      outgoingLight *= mix(
        vec3(1.0),
        vec3(${(bodyScale * 1.06).toFixed(3)}, ${(bodyScale * 0.85).toFixed(3)}, ${(bodyScale * 0.66).toFixed(3)}),
        overviewBodyDarken
      );
    `;
  }
  if (badge) {
    shader.uniforms.archiveOverviewBadge = badge;
    shader.fragmentShader = "uniform sampler2D archiveOverviewBadge;\n" + shader.fragmentShader;
    if (hoverBadge) {
      shader.uniforms.archiveHoverBadgeInstance = hoverBadge.instance;
      shader.vertexShader =
        "uniform int archiveHoverBadgeInstance;\nflat varying float vArchiveHoverBadge;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvArchiveHoverBadge = gl_InstanceID == archiveHoverBadgeInstance ? 1.0 : 0.0;",
        );
      shader.fragmentShader = "flat varying float vArchiveHoverBadge;\n" + shader.fragmentShader;
    }
    if (selectedHeadingEdge) {
      shader.uniforms.archiveSelectedHeadingEdge = selectedHeadingEdge;
      shader.fragmentShader = "uniform float archiveSelectedHeadingEdge;\n" + shader.fragmentShader;
    }
    if (!hoverBadge && selectedBadgeHeightFraction) {
      shader.uniforms.archiveBadgeHeightFraction = selectedBadgeHeightFraction;
      shader.fragmentShader = "uniform float archiveBadgeHeightFraction;\n" + shader.fragmentShader;
    }
    const badgeUv = hoverBadge
      ? `vec2(faceUv.x, 1.0 - (1.0 - faceUv.y) / ${hoverBadge.heightFraction.toFixed(8)})`
      : selectedBadgeHeightFraction
        ? "vec2(faceUv.x, 1.0 - (1.0 - faceUv.y) / archiveBadgeHeightFraction)"
        : "faceUv";
    const headingMask = selectedHeadingEdge
      ? "step(archiveSelectedHeadingEdge, faceUv.y)"
      : "1.0";
    finish += `
      ${hoverBadge ? "if (vArchiveHoverBadge > 0.5)" : ""} {
        vec2 faceUv = (vOverviewPosition.xy - vec2(-2.362, 0.139)) / vec2(4.724, 3.426);
        vec2 badgeUv = ${badgeUv};
        float inside = step(0.0, badgeUv.x) * step(badgeUv.x, 1.0) *
          step(0.0, badgeUv.y) * step(badgeUv.y, 1.0) * step(0.9, overviewNormal.z);
        vec4 plateSample = texture2D(archiveOverviewBadge, clamp(badgeUv, 0.0, 1.0));
        float badgeMix = inside * plateSample.a;
        vec3 lightShade = mix(vec3(0.42, 0.32, 0.23), vec3(1.0), slotDirect);
        vec3 badgeShade = mix(vec3(0.76, 0.72, 0.67), lightShade, archiveBottomLight);
        // Both heading states absorb the glass tint until the moving lamp reaches the slot.
        float unlitInk = ${headingMask} * archiveBottomLight *
          (1.0 - smoothstep(0.0, 1.0, slotDirect));
        vec3 warmInk = outgoingLight * vec3(0.46, 0.41, 0.37);
        vec3 badgeColor = mix(plateSample.rgb * 0.94 * badgeShade, warmInk, unlitInk);
        outgoingLight = mix(outgoingLight, badgeColor, badgeMix);
        #ifdef USE_TRANSMISSION
          material.transmissionAlpha = mix(
            material.transmissionAlpha, 1.0,
            badgeMix * (1.0 - unlitInk)
          );
        #endif
      }
    `;
  }
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <opaque_fragment>",
    finish + "\n#include <opaque_fragment>",
  );
}
