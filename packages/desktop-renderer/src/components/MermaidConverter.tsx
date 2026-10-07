import React, { useState, useCallback, useRef, useEffect } from "react";

import { convertToExcalidrawElements, exportToCanvas } from "@excalidraw/excalidraw";

import "./MermaidConverter.css";

type ExcalidrawElement = ReturnType<typeof convertToExcalidrawElements>[number];

// Lazy-load mermaid-to-excalidraw to avoid eager initialization issues
let parseMermaidToExcalidrawFn: typeof import("@excalidraw/mermaid-to-excalidraw").parseMermaidToExcalidraw | null = null;
const getMermaidParser = async () => {
  if (!parseMermaidToExcalidrawFn) {
    const mod = await import("@excalidraw/mermaid-to-excalidraw");
    parseMermaidToExcalidrawFn = mod.parseMermaidToExcalidraw;
  }
  return parseMermaidToExcalidrawFn;
};

interface MermaidConverterProps {
  onConvert: (elements: ExcalidrawElement[]) => void;
  onClose: () => void;
}

const EXAMPLE_MERMAID = `graph TD
    A[Start] --> B{Is it?}
    B -->|Yes| C[OK]
    C --> D[Rethink]
    D --> B
    B ---->|No| E[End]`;

const MermaidConverter: React.FC<MermaidConverterProps> = ({
  onConvert,
  onClose,
}) => {
  const [mermaidCode, setMermaidCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ExcalidrawElement[]>([]);
  const previewCanvasRef = useRef<HTMLDivElement>(null);

  const handleConvert = useCallback(async () => {
    if (!mermaidCode.trim()) {
      setError("Please enter Mermaid code");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const parseMermaid = await getMermaidParser();
      let result;
      try {
        result = await parseMermaid(mermaidCode, {
          themeVariables: { fontSize: "16px" },
        });
      } catch {
        // Fallback: try replacing double quotes with single quotes
        result = await parseMermaid(
          mermaidCode.replace(/"/g, "'"),
          { themeVariables: { fontSize: "16px" } },
        );
      }

      const { elements, files } = result;

      const excalidrawElements = convertToExcalidrawElements(elements, {
        regenerateIds: true,
      });

      setPreview(excalidrawElements);

      // Render visual preview
      if (previewCanvasRef.current && excalidrawElements.length > 0) {
        try {
          const canvas = await exportToCanvas({
            elements: excalidrawElements,
            files: files || null,
            exportPadding: 16,
            maxWidthOrHeight:
              Math.max(previewCanvasRef.current.offsetWidth, 300) *
              window.devicePixelRatio,
          });
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          previewCanvasRef.current.replaceChildren(canvas);
        } catch {
          // If canvas export fails, still show element count
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to parse Mermaid diagram",
      );
      setPreview([]);
    } finally {
      setIsLoading(false);
    }
  }, [mermaidCode]);

  const handleInsert = useCallback(() => {
    if (preview.length > 0) {
      onConvert(preview);
    }
  }, [preview, onConvert]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
      // Ctrl/Cmd + Enter to convert
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (preview.length > 0) {
          handleInsert();
        } else {
          handleConvert();
        }
      }
    },
    [onClose, handleConvert, handleInsert, preview],
  );

  // Auto-focus textarea on mount
  useEffect(() => {
    const textarea = document.getElementById("mermaid-code");
    textarea?.focus();
  }, []);

  return (
    <div
      className="mermaid-converter-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="mermaid-converter-modal">
        <div className="mermaid-converter-header">
          <h2>Import Mermaid Diagram</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="mermaid-converter-body">
          <div className="mermaid-input-panel">
            <div className="panel-header">
              <span>Mermaid Code</span>
              <button
                className="example-link"
                onClick={() => {
                  setMermaidCode(EXAMPLE_MERMAID);
                  setError(null);
                }}
              >
                Load example
              </button>
            </div>

            <textarea
              id="mermaid-code"
              value={mermaidCode}
              onChange={(e) => {
                setMermaidCode(e.target.value);
                setError(null);
              }}
              placeholder="Enter your Mermaid diagram code here...&#10;&#10;Examples:&#10;  graph TD&#10;    A[Start] --> B[End]&#10;&#10;  sequenceDiagram&#10;    Alice->>Bob: Hello"
              spellCheck={false}
            />

            {error && <div className="error-message">{error}</div>}

            <div className="button-row">
              <button
                onClick={handleConvert}
                disabled={isLoading || !mermaidCode.trim()}
                className="convert-button"
              >
                {isLoading ? "Converting..." : "Convert"}
              </button>
              {preview.length > 0 && (
                <button onClick={handleInsert} className="insert-button">
                  Insert into Canvas
                </button>
              )}
            </div>

            <div className="shortcut-hint">
              {preview.length > 0
                ? "Ctrl+Enter to insert"
                : "Ctrl+Enter to convert"}
            </div>
          </div>

          <div className="mermaid-preview-panel">
            <div className="panel-header">
              <span>Preview</span>
              {preview.length > 0 && (
                <span className="element-count">
                  {preview.length} elements
                </span>
              )}
            </div>

            <div className="preview-canvas" ref={previewCanvasRef}>
              {preview.length === 0 && !isLoading && (
                <div className="preview-placeholder">
                  Enter Mermaid code and click Convert to see preview
                </div>
              )}
              {isLoading && (
                <div className="preview-placeholder">Converting...</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export { MermaidConverter };
