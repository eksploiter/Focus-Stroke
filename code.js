figma.showUI(__html__, {
  width: 360,
  height: 400,
  themeColors: true
});

/* =====================================================
   LID SAFE TEXT CLEANER
   -----------------------------------------------------
   1. 모든 Text Layer → Inter
   2. 일반 Text Layer Name → "-"
   3. LID Text Layer Name → 유지
   4. 실제 characters는 변경하지 않음
===================================================== */

const loadedFonts = new Set();

/* =====================================================
   LID CHECK
===================================================== */

function isLidName(name) {
  const value = String(name || "").trim();

  if (!value) return false;

  const lower = value.toLowerCase();

  // 기존 LID 규칙
  if (
    lower.startsWith("cci_ctn_") ||
    lower.startsWith("cci_msg_") ||
    lower.startsWith("ctn_") ||
    lower.startsWith("msg_")
  ) {
    return true;
  }

  /*
   * Prefix가 없는 기존 LID 보호
   *
   * 예:
   * service_milestone_mileage_left_k
   * maintenance_process_card_04_eu_h
   *
   * 조건
   * - 공백 없음
   * - 영문/숫자/underscore만 사용
   * - underscore가 2개 이상
   * - _h / _k / _g 로 종료
   */
  const suffixLidPattern =
    /^[a-z0-9]+(?:_[a-z0-9]+){2,}_[hkg]$/i;

  if (suffixLidPattern.test(value)) {
    return true;
  }

  return false;
}

/* =====================================================
   COLLECT TEXT NODES
===================================================== */

function collectTextNodes(selection) {
  const result = [];
  const seen = new Set();

  function add(node) {
    if (
      !node ||
      node.type !== "TEXT" ||
      seen.has(node.id)
    ) {
      return;
    }

    seen.add(node.id);
    result.push(node);
  }

  for (const selectedNode of selection) {

    // Text 자체를 선택한 경우
    if (selectedNode.type === "TEXT") {
      add(selectedNode);
    }

    // Frame / Group / Component / Instance 등
    if ("findAll" in selectedNode) {
      const textNodes = selectedNode.findAll(
        node => node.type === "TEXT"
      );

      for (const textNode of textNodes) {
        add(textNode);
      }
    }
  }

  return result;
}

/* =====================================================
   INTER STYLE MAPPING
===================================================== */

function mapToInterStyle(styleName) {
  const original = String(styleName || "Regular");

  const normalized = original
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const italic =
    normalized.includes("italic") ||
    normalized.includes("oblique");

  let weight = "Regular";

  if (
    normalized.includes("black") ||
    normalized.includes("900")
  ) {
    weight = "Black";
  }

  else if (
    normalized.includes("extra bold") ||
    normalized.includes("extrabold") ||
    normalized.includes("ultra bold") ||
    normalized.includes("800")
  ) {
    weight = "Extra Bold";
  }

  else if (
    normalized.includes("semi bold") ||
    normalized.includes("semibold") ||
    normalized.includes("demi bold") ||
    normalized.includes("demibold") ||
    normalized.includes("600")
  ) {
    weight = "Semi Bold";
  }

  else if (
    normalized.includes("bold") ||
    normalized.includes("700")
  ) {
    weight = "Bold";
  }

  else if (
    normalized.includes("medium") ||
    normalized.includes("500")
  ) {
    weight = "Medium";
  }

  else if (
    normalized.includes("extra light") ||
    normalized.includes("extralight") ||
    normalized.includes("ultra light") ||
    normalized.includes("200")
  ) {
    weight = "Extra Light";
  }

  else if (
    normalized.includes("light") ||
    normalized.includes("300")
  ) {
    weight = "Light";
  }

  else if (
    normalized.includes("thin") ||
    normalized.includes("100")
  ) {
    weight = "Thin";
  }

  if (!italic) {
    return weight;
  }

  if (weight === "Regular") {
    return "Italic";
  }

  return `${weight} Italic`;
}

/* =====================================================
   FONT LOADER
===================================================== */

async function loadInterFont(style) {
  const key = `Inter::${style}`;

  if (loadedFonts.has(key)) {
    return {
      family: "Inter",
      style
    };
  }

  try {
    await figma.loadFontAsync({
      family: "Inter",
      style
    });

    loadedFonts.add(key);

    return {
      family: "Inter",
      style
    };
  } catch (_) {
    return null;
  }
}

/* =====================================================
   INTER FONT FALLBACK
===================================================== */

async function resolveInterFont(style) {
  const candidates = [];

  // 원래 Weight 최대한 유지
  candidates.push(style);

  // Italic 계열이면 일반 Italic도 시도
  if (style.includes("Italic")) {
    candidates.push("Italic");
  }

  // 이후 Regular
  candidates.push("Regular");

  const uniqueCandidates =
    [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    const font =
      await loadInterFont(candidate);

    if (font) {
      return font;
    }
  }

  return null;
}

/* =====================================================
   CONVERT TEXT NODE → INTER
===================================================== */

async function convertTextNodeToInter(node) {
  const result = {
    changed: false,
    convertedSegments: 0,
    failedSegments: 0
  };

  if (!node || node.type !== "TEXT") {
    return result;
  }

  let segments;

  try {
    segments =
      node.getStyledTextSegments([
        "fontName"
      ]);
  } catch (_) {
    result.failedSegments++;
    return result;
  }

  if (!segments || segments.length === 0) {
    return result;
  }

  for (const segment of segments) {

    const currentFont =
      segment.fontName;

    let currentStyle =
      "Regular";

    if (
      currentFont &&
      currentFont !== figma.mixed &&
      currentFont.style
    ) {
      currentStyle =
        currentFont.style;
    }

    const desiredStyle =
      mapToInterStyle(currentStyle);

    /*
     * 이미 원하는 Inter 스타일이면 Skip
     */
    if (
      currentFont &&
      currentFont !== figma.mixed &&
      currentFont.family === "Inter" &&
      currentFont.style === desiredStyle
    ) {
      continue;
    }

    const targetFont =
      await resolveInterFont(
        desiredStyle
      );

    if (!targetFont) {
      result.failedSegments++;
      continue;
    }

    try {
      node.setRangeFontName(
        segment.start,
        segment.end,
        targetFont
      );

      result.changed = true;
      result.convertedSegments++;

    } catch (_) {
      result.failedSegments++;
    }
  }

  return result;
}

/* =====================================================
   PROCESS
===================================================== */

async function runCleaner() {
  const selection =
    figma.currentPage.selection;

  if (!selection.length) {
    figma.ui.postMessage({
      type: "error",
      message:
        "정리할 Frame, Group 또는 Text Layer를 선택해주세요."
    });

    return;
  }

  const textNodes =
    collectTextNodes(selection);

  if (!textNodes.length) {
    figma.ui.postMessage({
      type: "error",
      message:
        "선택한 영역에서 Text Layer를 찾지 못했습니다."
    });

    return;
  }

  figma.ui.postMessage({
    type: "processing"
  });

  const stats = {
    total: textNodes.length,

    interConverted: 0,
    interSegments: 0,
    fontFailed: 0,

    renamedToHyphen: 0,
    lidProtected: 0,

    renameFailed: 0
  };

  for (const node of textNodes) {

    /*
     * 중요:
     * 이름을 변경하기 전에 먼저
     * LID 여부 저장
     */
    const hasLid =
      isLidName(node.name);

    /* -----------------------------------------
       FONT → INTER

       LID 여부와 관계없이 모든 Text에 적용
    ----------------------------------------- */

    const fontResult =
      await convertTextNodeToInter(node);

    if (fontResult.changed) {
      stats.interConverted++;
    }

    stats.interSegments +=
      fontResult.convertedSegments;

    stats.fontFailed +=
      fontResult.failedSegments;

    /* -----------------------------------------
       LAYER NAME
    ----------------------------------------- */

    if (hasLid) {

      // ★ LID는 절대 "-"로 변경하지 않음
      stats.lidProtected++;

    } else {

      try {

        if (node.name !== "-") {
          node.name = "-";
          stats.renamedToHyphen++;
        }

      } catch (_) {

        stats.renameFailed++;
      }
    }
  }

  figma.ui.postMessage({
    type: "complete",
    stats
  });

  figma.notify(
    `완료 · Text ${stats.total} · LID 보호 ${stats.lidProtected} · "-" ${stats.renamedToHyphen} · Inter ${stats.interConverted}`
  );
}

/* =====================================================
   MESSAGE
===================================================== */

figma.ui.onmessage =
  async msg => {

    if (!msg) {
      return;
    }

    if (msg.type === "run") {

      try {
        await runCleaner();
      } catch (error) {

        console.error(error);

        figma.ui.postMessage({
          type: "error",
          message:
            "작업 중 오류가 발생했습니다."
        });
      }

      return;
    }

    if (msg.type === "close") {
      figma.closePlugin();
    }
  };
