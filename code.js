figma.showUI(__html__, {
  width: 340,
  height: 500,
  themeColors: true
});

const PREFIX = "__FOCUS_STROKE__";

let rootFrame = null;
let previewRect = null;

let settings = {
  padding: 4,
  strokeWeight: 3,
  radius: 10,
  color: "#E63312",
  autoPreview: true
};

/* =========================================================
   UTIL
========================================================= */

function send(type, data = {}) {
  figma.ui.postMessage({
    type,
    ...data
  });
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");

  const value = parseInt(clean, 16);

  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255
  };
}

function isValidRoot(node) {
  return node && node.type === "FRAME";
}

function isDescendantOf(node, ancestor) {
  let current = node.parent;

  while (current) {
    if (current.id === ancestor.id) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

function isHighlight(node) {
  return (
    node &&
    typeof node.name === "string" &&
    node.name.startsWith(PREFIX)
  );
}

/* =========================================================
   SELECTION
========================================================= */

function getTargetSelection() {
  if (!rootFrame) {
    return [];
  }

  return figma.currentPage.selection.filter((node) => {
    if (isHighlight(node)) {
      return false;
    }

    if (node.id === rootFrame.id) {
      return false;
    }

    return isDescendantOf(node, rootFrame);
  });
}

/* =========================================================
   BOUNDS
========================================================= */

function getUnionBounds(nodes) {
  if (!nodes.length) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  let found = false;

  for (const node of nodes) {
    const bounds = node.absoluteBoundingBox;

    if (!bounds) {
      continue;
    }

    found = true;

    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);

    maxX = Math.max(
      maxX,
      bounds.x + bounds.width
    );

    maxY = Math.max(
      maxY,
      bounds.y + bounds.height
    );
  }

  if (!found) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/* =========================================================
   PREVIEW
========================================================= */

function removePreview() {
  if (!previewRect) {
    return;
  }

  try {
    if (!previewRect.removed) {
      previewRect.remove();
    }
  } catch (error) {
    // 이미 삭제된 경우 무시
  }

  previewRect = null;
}

function createPreviewRect() {
  const rect = figma.createRectangle();

  rect.name = `${PREFIX}_PREVIEW`;

  rect.fills = [];

  rect.strokeAlign = "INSIDE";

  rect.strokes = [
    {
      type: "SOLID",
      color: hexToRgb(settings.color)
    }
  ];

  rect.strokeWeight = settings.strokeWeight;

  rect.cornerRadius = settings.radius;

  return rect;
}

/* =========================================================
   HIGHLIGHT UPDATE
========================================================= */

function updatePreview() {
  if (!rootFrame) {
    removePreview();

    send("status", {
      message: "먼저 기준 Frame을 등록해주세요.",
      kind: "warning"
    });

    return;
  }

  const selection = getTargetSelection();

  if (!selection.length) {
    removePreview();

    send("selection-info", {
      count: 0
    });

    return;
  }

  const bounds = getUnionBounds(selection);

  if (!bounds) {
    removePreview();
    return;
  }

  const rootBounds = rootFrame.absoluteBoundingBox;

  if (!rootBounds) {
    removePreview();

    send("status", {
      message: "기준 Frame의 위치 정보를 읽을 수 없습니다.",
      kind: "error"
    });

    return;
  }

  const padding = settings.padding;

  const x =
    bounds.x -
    rootBounds.x -
    padding;

  const y =
    bounds.y -
    rootBounds.y -
    padding;

  const width =
    bounds.width +
    padding * 2;

  const height =
    bounds.height +
    padding * 2;

  if (!previewRect || previewRect.removed) {
    previewRect = createPreviewRect();

    rootFrame.appendChild(previewRect);
  }

  /*
   * 핵심
   *
   * 기준 Frame이 Auto Layout인 경우에도
   * Highlight Rectangle은 Auto Layout 흐름에 참여하지 않는다.
   */
  if (rootFrame.layoutMode !== "NONE") {
    previewRect.layoutPositioning = "ABSOLUTE";
  }

  previewRect.locked = false;

  previewRect.x = x;
  previewRect.y = y;

  previewRect.resize(
    Math.max(1, width),
    Math.max(1, height)
  );

  previewRect.strokeWeight =
    settings.strokeWeight;

  previewRect.cornerRadius =
    Math.min(
      settings.radius,
      width / 2,
      height / 2
    );

  previewRect.strokes = [
    {
      type: "SOLID",
      color: hexToRgb(settings.color)
    }
  ];

  /*
   * 항상 화면의 가장 위에 표시
   */
  rootFrame.appendChild(previewRect);

  /*
   * Canvas에서 실수로 잡히지 않도록 Lock
   */
  previewRect.locked = true;

  send("selection-info", {
    count: selection.length,
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  });

  send("status", {
    message: `${selection.length}개 레이어를 기준으로 영역을 표시했습니다.`,
    kind: "success"
  });
}

/* =========================================================
   ROOT FRAME
========================================================= */

function setRootFrame() {
  const selection =
    figma.currentPage.selection;

  if (selection.length !== 1) {
    send("status", {
      message: "기준으로 사용할 Frame 하나만 선택해주세요.",
      kind: "error"
    });

    return;
  }

  const node = selection[0];

  if (!isValidRoot(node)) {
    send("status", {
      message: "기준 영역은 Frame이어야 합니다.",
      kind: "error"
    });

    return;
  }

  removePreview();

  rootFrame = node;

  send("root-set", {
    name: rootFrame.name
  });

  send("status", {
    message: "기준 Frame이 등록되었습니다. 이제 강조할 영역을 선택해주세요.",
    kind: "success"
  });
}

/* =========================================================
   CONFIRM
========================================================= */

function confirmPreview() {
  if (!previewRect || previewRect.removed) {
    send("status", {
      message: "확정할 Highlight가 없습니다.",
      kind: "warning"
    });

    return;
  }

  const existing = rootFrame.findAll((node) => {
    return (
      isHighlight(node) &&
      node.name !== `${PREFIX}_PREVIEW`
    );
  });

  const number =
    String(existing.length + 1).padStart(2, "0");

  previewRect.locked = false;

  previewRect.name =
    `${PREFIX}_${number}`;

  previewRect.locked = true;

  previewRect = null;

  send("status", {
    message: `Highlight ${number}이 확정되었습니다.`,
    kind: "success"
  });
}

/* =========================================================
   DELETE ALL
========================================================= */

function clearHighlights() {
  if (!rootFrame) {
    send("status", {
      message: "등록된 기준 Frame이 없습니다.",
      kind: "warning"
    });

    return;
  }

  const nodes = rootFrame.findAll((node) => {
    return isHighlight(node);
  });

  for (const node of nodes) {
    node.remove();
  }

  previewRect = null;

  send("status", {
    message: `${nodes.length}개의 Highlight를 삭제했습니다.`,
    kind: "success"
  });
}

/* =========================================================
   SELECTION LISTENER
========================================================= */

figma.on("selectionchange", () => {
  if (!rootFrame) {
    return;
  }

  if (!settings.autoPreview) {
    return;
  }

  updatePreview();
});

/* =========================================================
   MESSAGE
========================================================= */

figma.ui.onmessage = (msg) => {
  switch (msg.type) {
    case "set-root": {
      setRootFrame();
      break;
    }

    case "refresh-preview": {
      updatePreview();
      break;
    }

    case "confirm": {
      confirmPreview();
      break;
    }

    case "remove-preview": {
      removePreview();

      send("selection-info", {
        count: 0
      });

      send("status", {
        message: "미리보기를 제거했습니다.",
        kind: "success"
      });

      break;
    }

    case "clear-all": {
      clearHighlights();
      break;
    }

    case "settings": {
      settings = {
        ...settings,
        ...msg.settings
      };

      if (previewRect) {
        updatePreview();
      }

      break;
    }

    case "close": {
      figma.closePlugin();
      break;
    }
  }
};
