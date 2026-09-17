figma.showUI(__html__, {
  width: 340,
  height: 500,
  themeColors: true
});

const PREFIX = "__FOCUS_STROKE__";

let rootFrame = null;
let previewRect = null;

let settings = {
  sideMargin: 16,       // ★ 디자인 화면 좌우 여백
  verticalPadding: 4,   // ★ 선택 영역 위아래 여백
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

    minX = Math.min(
      minX,
      bounds.x
    );

    minY = Math.min(
      minY,
      bounds.y
    );

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

    width:
      maxX - minX,

    height:
      maxY - minY
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
  const rect =
    figma.createRectangle();

  rect.name =
    `${PREFIX}_PREVIEW`;

  rect.fills = [];

  rect.strokes = [
    {
      type: "SOLID",
      color: hexToRgb(
        settings.color
      )
    }
  ];

  rect.strokeAlign =
    "INSIDE";

  rect.strokeWeight =
    settings.strokeWeight;

  rect.cornerRadius =
    settings.radius;

  return rect;
}


/* =========================================================
   FULL WIDTH HIGHLIGHT
========================================================= */

function updatePreview() {

  /* -------------------------
     Root Frame 확인
  ------------------------- */

  if (!rootFrame) {
    removePreview();

    send("status", {
      message:
        "먼저 기준 Frame을 등록해주세요.",
      kind: "warning"
    });

    return;
  }


  /* -------------------------
     Selection 확인
  ------------------------- */

  const selection =
    getTargetSelection();

  if (!selection.length) {
    removePreview();

    send("selection-info", {
      count: 0
    });

    return;
  }


  /* -------------------------
     Selection Bounds 계산
  ------------------------- */

  const bounds =
    getUnionBounds(selection);

  if (!bounds) {
    removePreview();
    return;
  }


  /* -------------------------
     Root Bounds
  ------------------------- */

  const rootBounds =
    rootFrame.absoluteBoundingBox;

  if (!rootBounds) {
    removePreview();

    send("status", {
      message:
        "기준 Frame의 위치를 읽을 수 없습니다.",
      kind: "error"
    });

    return;
  }


  /* =====================================================
     ★ 핵심 계산
     
     가로:
     Selection 위치를 사용하지 않음
     
     세로:
     Selection 위치만 사용
  ===================================================== */

  const sideMargin =
    settings.sideMargin;

  const verticalPadding =
    settings.verticalPadding;


  /* -------------------------
     X

     Frame 기준으로 항상
     좌측 여백만큼 떨어짐
  ------------------------- */

  const x =
    sideMargin;


  /* -------------------------
     Width

     전체 Frame 폭에서
     좌우 여백 제거
  ------------------------- */

  const width =
    rootFrame.width -
    sideMargin * 2;


  /* -------------------------
     Y

     Selection의 실제
     세로 시작 위치 사용
  ------------------------- */

  const y =
    bounds.y -
    rootBounds.y -
    verticalPadding;


  /* -------------------------
     Height

     Selection 세로 높이에
     위아래 Padding 추가
  ------------------------- */

  const height =
    bounds.height +
    verticalPadding * 2;


  /* =====================================================
     Rectangle 생성
  ===================================================== */

  if (
    !previewRect ||
    previewRect.removed
  ) {

    previewRect =
      createPreviewRect();

    rootFrame.appendChild(
      previewRect
    );
  }


  /* =====================================================
     Auto Layout 대응
  ===================================================== */

  if (
    rootFrame.layoutMode !== "NONE"
  ) {

    previewRect.layoutPositioning =
      "ABSOLUTE";
  }


  previewRect.locked = false;


  /* =====================================================
     위치 설정
  ===================================================== */

  previewRect.x =
    x;

  previewRect.y =
    y;


  /* =====================================================
     크기 설정
  ===================================================== */

  previewRect.resize(
    Math.max(
      1,
      width
    ),

    Math.max(
      1,
      height
    )
  );


  /* =====================================================
     스타일 적용
  ===================================================== */

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

      color:
        hexToRgb(
          settings.color
        )
    }
  ];


  /* =====================================================
     항상 최상단 표시
  ===================================================== */

  rootFrame.appendChild(
    previewRect
  );


  /* =====================================================
     실수로 선택되지 않도록 Lock
  ===================================================== */

  previewRect.locked =
    true;


  /* =====================================================
     UI 정보 전달
  ===================================================== */

  send("selection-info", {
    count:
      selection.length,

    width:
      Math.round(width),

    height:
      Math.round(height)
  });


  send("status", {
    message:
      `${selection.length}개 레이어의 세로 영역을 기준으로 Highlight를 표시했습니다.`,
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
      message:
        "기준으로 사용할 Frame 하나만 선택해주세요.",
      kind: "error"
    });

    return;
  }


  const node =
    selection[0];


  if (!isValidRoot(node)) {

    send("status", {
      message:
        "기준 화면은 Frame이어야 합니다.",
      kind: "error"
    });

    return;
  }


  removePreview();

  rootFrame =
    node;


  send("root-set", {
    name:
      rootFrame.name,

    width:
      Math.round(
        rootFrame.width
      )
  });


  send("status", {
    message:
      "기준 Frame이 등록되었습니다. Highlight할 영역을 선택해주세요.",
    kind: "success"
  });
}


/* =========================================================
   CONFIRM
========================================================= */

function confirmPreview() {

  if (
    !previewRect ||
    previewRect.removed
  ) {

    send("status", {
      message:
        "확정할 Highlight가 없습니다.",
      kind: "warning"
    });

    return;
  }


  const existing =
    rootFrame.findAll(
      (node) => {

        return (
          isHighlight(node) &&
          node.name !==
          `${PREFIX}_PREVIEW`
        );
      }
    );


  const number =
    String(
      existing.length + 1
    ).padStart(
      2,
      "0"
    );


  previewRect.locked =
    false;


  previewRect.name =
    `${PREFIX}_${number}`;


  previewRect.locked =
    true;


  previewRect =
    null;


  send("status", {
    message:
      `Highlight ${number}이 확정되었습니다.`,
    kind: "success"
  });
}


/* =========================================================
   CLEAR
========================================================= */

function clearHighlights() {

  if (!rootFrame) {

    send("status", {
      message:
        "등록된 기준 Frame이 없습니다.",
      kind: "warning"
    });

    return;
  }


  const nodes =
    rootFrame.findAll(
      (node) =>
        isHighlight(node)
    );


  for (
    const node of nodes
  ) {

    node.remove();
  }


  previewRect =
    null;


  send("status", {
    message:
      `${nodes.length}개의 Highlight를 삭제했습니다.`,
    kind: "success"
  });
}


/* =========================================================
   SELECTION CHANGE
========================================================= */

figma.on(
  "selectionchange",
  () => {

    if (!rootFrame) {
      return;
    }

    if (
      !settings.autoPreview
    ) {
      return;
    }

    updatePreview();
  }
);


/* =========================================================
   MESSAGE
========================================================= */

figma.ui.onmessage =
  (msg) => {

    switch (msg.type) {


      /* -------------------------
         Root
      ------------------------- */

      case "set-root": {

        setRootFrame();

        break;
      }


      /* -------------------------
         Preview
      ------------------------- */

      case "refresh-preview": {

        updatePreview();

        break;
      }


      /* -------------------------
         Confirm
      ------------------------- */

      case "confirm": {

        confirmPreview();

        break;
      }


      /* -------------------------
         Preview 삭제
      ------------------------- */

      case "remove-preview": {

        removePreview();

        send(
          "selection-info",
          {
            count: 0
          }
        );

        send("status", {
          message:
            "미리보기를 제거했습니다.",
          kind: "success"
        });

        break;
      }


      /* -------------------------
         전체 삭제
      ------------------------- */

      case "clear-all": {

        clearHighlights();

        break;
      }


      /* -------------------------
         Settings
      ------------------------- */

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


      /* -------------------------
         Close
      ------------------------- */

      case "close": {

        figma.closePlugin();

        break;
      }
    }
  };
