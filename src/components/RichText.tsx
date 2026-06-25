import React from "react";

export function RichText({ text }: { text: string }) {
  if (!text) return null;

  // Split by ^... to extract superscripts.
  // Matches:
  // 1. ^-2, ^+2, ^2 (numbers with optional signs)
  // 2. ^a, ^n (single alphabetical characters)
  // 3. ^{...}, ^(...) (bracketed expressions)
  const regex = /(\^[-+]?\d+|\^[a-zA-Z]|\^(?:\{[^}]+\}|\([^)]+\)|\[[^\]]+\]))/g;
  
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        
        if (part.startsWith("^")) {
          let content = part.slice(1);
          // Remove wrapping brackets if they exist (e.g. ^{2} -> 2)
          if (content.match(/^[({\[].*[})\]]$/)) {
            content = content.substring(1, content.length - 1);
          }
          return <sup key={index}>{content}</sup>;
        }

        // Handle subscripts for chemical formulas like H_2O
        if (part.includes("_")) {
          const subRegex = /(_\d+|_{[^}]+})/g;
          const subParts = part.split(subRegex);
          return (
            <React.Fragment key={index}>
              {subParts.map((sp, j) => {
                if (sp.startsWith("_")) {
                  let subContent = sp.slice(1);
                  if (subContent.match(/^\{.*\}$/)) {
                    subContent = subContent.substring(1, subContent.length - 1);
                  }
                  return <sub key={j}>{subContent}</sub>;
                }
                return <span key={j}>{sp}</span>;
              })}
            </React.Fragment>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
