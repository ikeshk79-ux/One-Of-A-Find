import { useState } from "react";
import { Camera, Check, Copy, Printer, Sparkles, Tag } from "lucide-react";

// ── Sunroom Thrift demo palette ──────────────────────────────────────────────
// A standalone, self-contained mock-up (no auth, no data) that re-skins the core
// One Of A Find surfaces so the client can preview a warm cream/sage/mustard look.
// All colours are inline so this page never touches the live obsidian theme.
const C = {
  bg: "#FBF6EE", // cream background
  card: "#D9E2CE", // sage-green cards
  cardSoft: "#E6ECDD", // lighter sage for insets
  border: "#BFCDAF", // sage border
  accent: "#E0A93A", // mustard-yellow accent
  accentDeep: "#C7902A",
  ink: "#33362C", // headings
  muted: "#6E7361", // secondary text
  white: "#FFFDF8",
};

function Panel({
  label,
  value,
  selected,
  accent,
  onClick,
  testid,
}: {
  label: string;
  value: string;
  selected?: boolean;
  accent?: boolean;
  onClick: () => void;
  testid: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      style={{
        textAlign: "left",
        borderRadius: 12,
        padding: 16,
        transition: "all .18s ease",
        cursor: "pointer",
        border: `1px solid ${selected ? C.accent : C.border}`,
        background: selected ? "rgba(224,169,58,0.16)" : C.white,
        boxShadow: selected ? `0 0 0 3px rgba(224,169,58,0.22)` : "none",
      }}
    >
      <span
        style={{
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.muted,
        }}
      >
        {label}
      </span>
      <span
        style={{
          display: "block",
          marginTop: 8,
          fontFamily: "'Space Grotesk', ui-sans-serif, system-ui",
          fontSize: 26,
          fontWeight: 600,
          color: accent ? C.accentDeep : C.ink,
        }}
      >
        {value}
      </span>
    </button>
  );
}

export default function SunroomDemo() {
  const [choice, setChoice] = useState<"peak" | "market" | "charity" | "custom">("charity");

  return (
    <div
      data-testid="sunroom-demo"
      style={{ minHeight: "100vh", background: C.bg, color: C.ink }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 28px",
          borderBottom: `1px solid ${C.border}`,
          background: C.white,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: C.accent,
              color: C.white,
            }}
          >
            <Tag size={18} />
          </span>
          <span
            style={{
              fontFamily: "'Space Grotesk', ui-sans-serif, system-ui",
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              fontSize: 14,
            }}
          >
            Sunroom Thrift
          </span>
        </div>
        <nav style={{ display: "flex", gap: 20, fontSize: 13, color: C.muted }}>
          <span style={{ color: C.ink, fontWeight: 600 }}>Appraise</span>
          <span>Inventory</span>
          <span>Activity</span>
          <span>Volunteers</span>
        </nav>
      </header>

      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 28px 56px" }}>
        <div style={{ marginBottom: 8 }}>
          <span
            style={{
              display: "inline-block",
              padding: "4px 10px",
              borderRadius: 999,
              background: "rgba(224,169,58,0.18)",
              color: C.accentDeep,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Colour scheme preview
          </span>
        </div>
        <h1
          style={{
            fontFamily: "'Space Grotesk', ui-sans-serif, system-ui",
            fontSize: 30,
            fontWeight: 700,
            margin: "6px 0 4px",
          }}
        >
          Valuation
        </h1>
        <p style={{ color: C.muted, fontSize: 14, maxWidth: 560 }}>
          A demo of the appraisal flow in cream, sage-green and mustard — the live app is unchanged.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 1fr",
            gap: 24,
            marginTop: 28,
            alignItems: "start",
          }}
        >
          {/* Valuation card */}
          <section
            style={{
              borderRadius: 16,
              border: `1px solid ${C.border}`,
              background: C.card,
              padding: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <div>
                <p
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: C.muted,
                  }}
                >
                  Barbour
                </p>
                <h2
                  style={{
                    fontFamily: "'Space Grotesk', ui-sans-serif, system-ui",
                    fontSize: 22,
                    fontWeight: 600,
                    marginTop: 2,
                  }}
                >
                  Waxed cotton field jacket
                </h2>
              </div>
              <span
                style={{
                  height: "fit-content",
                  padding: "4px 10px",
                  borderRadius: 999,
                  border: `1px solid ${C.accent}`,
                  background: "rgba(224,169,58,0.14)",
                  color: C.accentDeep,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Excellent
              </span>
            </div>

            <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.6, color: C.muted }}>
              Olive green waxed cotton with a corduroy collar and tartan lining. A heritage staple in
              excellent pre-loved condition — a standout donation for the rail.
            </p>

            {/* Price panels */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginTop: 22,
              }}
            >
              <Panel label="Peak RRP" value="£249.00" testid="demo-price-peak" selected={choice === "peak"} onClick={() => setChoice("peak")} />
              <Panel label="Market avg" value="£90.00" testid="demo-price-market" selected={choice === "market"} onClick={() => setChoice("market")} />
              <Panel label="Charity price" value="£103.50" accent testid="demo-price-charity" selected={choice === "charity"} onClick={() => setChoice("charity")} />
              <button
                type="button"
                onClick={() => setChoice("custom")}
                data-testid="demo-price-custom"
                style={{
                  textAlign: "left",
                  borderRadius: 12,
                  padding: 16,
                  cursor: "pointer",
                  transition: "all .18s ease",
                  border: `1px solid ${choice === "custom" ? C.accent : C.border}`,
                  background: choice === "custom" ? "rgba(224,169,58,0.16)" : C.white,
                  boxShadow: choice === "custom" ? `0 0 0 3px rgba(224,169,58,0.22)` : "none",
                }}
              >
                <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted }}>
                  Set my own price
                </span>
                <span
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 4,
                    marginTop: 8,
                    fontFamily: "'Space Grotesk', ui-sans-serif, system-ui",
                    fontSize: 26,
                    fontWeight: 600,
                    color: C.accentDeep,
                  }}
                >
                  £<span style={{ color: C.ink }}>95.00</span>
                </span>
              </button>
            </div>

            {/* Resale listing */}
            <div
              style={{
                marginTop: 22,
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.cardSoft,
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: C.accentDeep,
                    fontWeight: 700,
                  }}
                >
                  Resale listing draft
                </span>
                <button
                  type="button"
                  data-testid="demo-copy"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: C.white,
                    fontSize: 13,
                    cursor: "pointer",
                    color: C.ink,
                  }}
                >
                  <Copy size={14} /> Copy
                </button>
              </div>
              <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: C.muted }}>
                Embrace timeless British style with this classic Barbour waxed jacket in olive green.
                Excellent pre-loved condition with that iconic corduroy collar — a sustainable buy that
                lasts for years. #Barbour #WaxJacket #SunroomThrift
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
              <button
                type="button"
                data-testid="demo-save"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "11px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: C.accent,
                  color: "#3a2c07",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Check size={16} /> Save &amp; make tag
              </button>
              <button
                type="button"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "11px 18px",
                  borderRadius: 10,
                  border: `1px solid ${C.border}`,
                  background: "transparent",
                  color: C.ink,
                  cursor: "pointer",
                }}
              >
                <Sparkles size={16} /> Re-appraise
              </button>
            </div>
          </section>

          {/* Right column: capture + inventory preview */}
          <section style={{ display: "grid", gap: 20 }}>
            <div
              style={{
                borderRadius: 16,
                border: `1px dashed ${C.border}`,
                background: C.card,
                padding: 24,
              }}
            >
              <p style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: C.accentDeep, fontWeight: 600 }}>
                Step 01
              </p>
              <div
                style={{
                  marginTop: 14,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                {["Item photo", "Brand label"].map((t) => (
                  <div
                    key={t}
                    style={{
                      height: 130,
                      borderRadius: 12,
                      border: `1px dashed ${C.border}`,
                      background: C.white,
                      display: "grid",
                      placeItems: "center",
                      gap: 8,
                      color: C.muted,
                    }}
                  >
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 42,
                        height: 42,
                        borderRadius: 999,
                        background: "rgba(224,169,58,0.16)",
                        color: C.accentDeep,
                      }}
                    >
                      <Camera size={18} />
                    </span>
                    <span style={{ fontSize: 12 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                borderRadius: 16,
                border: `1px solid ${C.border}`,
                background: C.card,
                padding: 20,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ fontFamily: "'Space Grotesk', ui-sans-serif, system-ui", fontSize: 15, fontWeight: 600 }}>
                  Recently added
                </h3>
                <button
                  type="button"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: C.accentDeep,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Printer size={14} /> Print tags
                </button>
              </div>
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                {[
                  ["Levi's 501 jeans", "Men's general", "£40.25"],
                  ["Le Creuset casserole", "Homewear", "£58.00"],
                  ["Silk floral scarf", "Women's accessories", "£12.50"],
                ].map(([title, cat, price]) => (
                  <div
                    key={title}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: C.white,
                      border: `1px solid ${C.border}`,
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 600 }}>{title}</p>
                      <p style={{ fontSize: 12, color: C.muted }}>{cat}</p>
                    </div>
                    <span
                      style={{
                        fontFamily: "'Space Grotesk', ui-sans-serif, system-ui",
                        fontSize: 16,
                        fontWeight: 700,
                        color: C.accentDeep,
                      }}
                    >
                      {price}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Swatches */}
        <div
          style={{
            marginTop: 32,
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "center",
          }}
          data-testid="demo-swatches"
        >
          {[
            ["Cream bg", C.bg],
            ["Sage card", C.card],
            ["Sage border", C.border],
            ["Mustard accent", C.accent],
            ["Ink", C.ink],
          ].map(([name, hex]) => (
            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: hex,
                  border: `1px solid ${C.border}`,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 12, color: C.muted }}>
                {name} <span style={{ fontFamily: "monospace" }}>{hex}</span>
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
