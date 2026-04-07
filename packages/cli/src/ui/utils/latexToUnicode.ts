/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Converts LaTeX math notation to Unicode equivalents for terminal display.
 *
 * Terminals cannot render LaTeX — this converts common patterns like
 * $p_1 \cdot p_2$ → p₁ · p₂ so mathematical content reads naturally.
 *
 * Applied as a pre-processing step before the markdown parser runs.
 */

// ---------------------------------------------------------------------------
// Unicode subscript / superscript maps
// ---------------------------------------------------------------------------

const SUBSCRIPT_DIGITS: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
};

const SUBSCRIPT_LETTERS: Record<string, string> = {
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
  'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
  'v': 'ᵥ', 'x': 'ₓ',
};

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

const SUPERSCRIPT_LETTERS: Record<string, string> = {
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ',
  'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ',
  'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ',
  'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ',
  'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
};

const SUPERSCRIPT_SPECIAL: Record<string, string> = {
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
};

// ---------------------------------------------------------------------------
// LaTeX command → Unicode mapping
// ---------------------------------------------------------------------------

const LATEX_COMMANDS: Record<string, string> = {
  // Greek lowercase
  'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ',
  'epsilon': 'ε', 'varepsilon': 'ε', 'zeta': 'ζ', 'eta': 'η',
  'theta': 'θ', 'vartheta': 'ϑ', 'iota': 'ι', 'kappa': 'κ',
  'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ',
  'pi': 'π', 'varpi': 'ϖ', 'rho': 'ρ', 'varrho': 'ϱ',
  'sigma': 'σ', 'varsigma': 'ς', 'tau': 'τ', 'upsilon': 'υ',
  'phi': 'φ', 'varphi': 'ϕ', 'chi': 'χ', 'psi': 'ψ',
  'omega': 'ω',

  // Greek uppercase
  'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ', 'Lambda': 'Λ',
  'Xi': 'Ξ', 'Pi': 'Π', 'Sigma': 'Σ', 'Upsilon': 'Υ',
  'Phi': 'Φ', 'Psi': 'Ψ', 'Omega': 'Ω',

  // Operators
  'cdot': '·', 'times': '×', 'div': '÷', 'pm': '±', 'mp': '∓',
  'ast': '∗', 'star': '⋆', 'circ': '∘', 'bullet': '•',
  'oplus': '⊕', 'otimes': '⊗', 'odot': '⊙',

  // Relations
  'leq': '≤', 'le': '≤', 'geq': '≥', 'ge': '≥',
  'neq': '≠', 'ne': '≠', 'approx': '≈', 'equiv': '≡',
  'sim': '∼', 'simeq': '≃', 'cong': '≅',
  'propto': '∝', 'll': '≪', 'gg': '≫',
  'prec': '≺', 'succ': '≻', 'preceq': '⪯', 'succeq': '⪰',

  // Arrows
  'to': '→', 'rightarrow': '→', 'Rightarrow': '⇒',
  'leftarrow': '←', 'Leftarrow': '⇐',
  'leftrightarrow': '↔', 'Leftrightarrow': '⇔',
  'implies': '⇒', 'iff': '⇔',
  'uparrow': '↑', 'downarrow': '↓',
  'mapsto': '↦', 'longmapsto': '⟼',
  'longrightarrow': '⟶', 'longleftarrow': '⟵',

  // Logic
  'forall': '∀', 'exists': '∃', 'nexists': '∄',
  'neg': '¬', 'lnot': '¬',
  'land': '∧', 'wedge': '∧', 'lor': '∨', 'vee': '∨',
  'top': '⊤', 'bot': '⊥', 'vdash': '⊢', 'models': '⊨',

  // Sets
  'in': '∈', 'notin': '∉', 'ni': '∋',
  'subset': '⊂', 'supset': '⊃',
  'subseteq': '⊆', 'supseteq': '⊇',
  'cup': '∪', 'cap': '∩',
  'setminus': '∖', 'emptyset': '∅', 'varnothing': '∅',

  // Big operators
  'sum': '∑', 'prod': '∏', 'coprod': '∐',
  'int': '∫', 'iint': '∬', 'iiint': '∭', 'oint': '∮',
  'bigcup': '⋃', 'bigcap': '⋂',
  'bigoplus': '⨁', 'bigotimes': '⨂',

  // Misc symbols
  'infty': '∞', 'partial': '∂', 'nabla': '∇',
  'therefore': '∴', 'because': '∵',
  'sqrt': '√', 'surd': '√',
  'angle': '∠', 'measuredangle': '∡',
  'triangle': '△', 'square': '□',
  'diamond': '◇', 'lozenge': '◊',
  'dagger': '†', 'ddagger': '‡',
  'ell': 'ℓ', 'hbar': 'ℏ', 'Re': 'ℜ', 'Im': 'ℑ',
  'wp': '℘', 'aleph': 'ℵ',
  'qed': '∎', 'blacksquare': '■',

  // Dots
  'ldots': '…', 'cdots': '⋯', 'vdots': '⋮', 'ddots': '⋱',
  'dots': '…',

  // Spacing (collapse to single space or nothing)
  'quad': '  ', 'qquad': '    ',
  'enspace': ' ', 'thinspace': ' ',
  ',': ' ', ';': ' ', '!': '',

  // Delimiters
  'langle': '⟨', 'rangle': '⟩',
  'lceil': '⌈', 'rceil': '⌉',
  'lfloor': '⌊', 'rfloor': '⌋',
  'lvert': '|', 'rvert': '|',
  'lVert': '‖', 'rVert': '‖',
  'lbrace': '{', 'rbrace': '}',
};

// Blackboard bold (double-struck) letters: \mathbb{R} → ℝ
const MATHBB: Record<string, string> = {
  'A': '𝔸', 'B': '𝔹', 'C': 'ℂ', 'D': '𝔻', 'E': '𝔼',
  'F': '𝔽', 'G': '𝔾', 'H': 'ℍ', 'I': '𝕀', 'J': '𝕁',
  'K': '𝕂', 'L': '𝕃', 'M': '𝕄', 'N': 'ℕ', 'O': '𝕆',
  'P': 'ℙ', 'Q': 'ℚ', 'R': 'ℝ', 'S': '𝕊', 'T': '𝕋',
  'U': '𝕌', 'V': '𝕍', 'W': '𝕎', 'X': '𝕏', 'Y': '𝕐',
  'Z': 'ℤ',
};

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function toSubscript(s: string): string {
  return Array.from(s).map(c =>
    SUBSCRIPT_DIGITS[c] ?? SUBSCRIPT_LETTERS[c] ?? c,
  ).join('');
}

function toSuperscript(s: string): string {
  return Array.from(s).map(c =>
    SUPERSCRIPT_DIGITS[c] ?? SUPERSCRIPT_LETTERS[c] ?? SUPERSCRIPT_SPECIAL[c] ?? c,
  ).join('');
}

/**
 * Convert LaTeX math content (inside delimiters) to Unicode.
 */
function convertMathContent(math: string): string {
  let result = math;

  // \frac{a}{b} → a/b
  result = result.replace(/\\frac\s*\{([^}]*)\}\s*\{([^}]*)\}/g, (_m, num, den) =>
    `${convertMathContent(num as string)}/${convertMathContent(den as string)}`,
  );

  // \sqrt{x} → √(x) and \sqrt[n]{x} → ⁿ√(x)
  result = result.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^}]*)\}/g, (_m, n, body) =>
    `${toSuperscript(n as string)}√(${convertMathContent(body as string)})`,
  );
  result = result.replace(/\\sqrt\s*\{([^}]*)\}/g, (_m, body) =>
    `√(${convertMathContent(body as string)})`,
  );

  // \mathbb{X} → double-struck
  result = result.replace(/\\mathbb\s*\{([A-Z])\}/g, (_m, letter) =>
    MATHBB[letter as string] ?? (letter as string),
  );

  // \text{...}, \mathrm{...}, \textit{...}, \textbf{...} → strip command
  result = result.replace(/\\(?:text|mathrm|textrm)\s*\{([^}]*)\}/g, '$1');
  result = result.replace(/\\textbf\s*\{([^}]*)\}/g, '**$1**');
  result = result.replace(/\\textit\s*\{([^}]*)\}/g, '*$1*');

  // \overline{x} → x̄, \hat{x} → x̂, etc.
  result = result.replace(/\\overline\s*\{([^}])\}/g, '$1\u0304');
  result = result.replace(/\\bar\s*\{([^}])\}/g, '$1\u0304');
  result = result.replace(/\\hat\s*\{([^}])\}/g, '$1\u0302');
  result = result.replace(/\\tilde\s*\{([^}])\}/g, '$1\u0303');
  result = result.replace(/\\vec\s*\{([^}])\}/g, '$1\u20D7');
  result = result.replace(/\\dot\s*\{([^}])\}/g, '$1\u0307');

  // Subscripts: _{...} then _x
  result = result.replace(/_\{([^}]*)\}/g, (_m, content) =>
    toSubscript(content as string),
  );
  result = result.replace(/_([a-zA-Z0-9])/g, (_m, c) =>
    toSubscript(c as string),
  );

  // Superscripts: ^{...} then ^x
  result = result.replace(/\^\{([^}]*)\}/g, (_m, content) =>
    toSuperscript(content as string),
  );
  result = result.replace(/\^([a-zA-Z0-9+\-])/g, (_m, c) =>
    toSuperscript(c as string),
  );

  // \left and \right sizing hints — remove, keep delimiter
  result = result.replace(/\\(?:left|right)\s*([()[\]|.])/g, '$1');
  result = result.replace(/\\(?:left|right)\s*\\([{}])/g, (_m, d) =>
    d === '{' ? '{' : '}',
  );
  result = result.replace(/\\(?:left|right)\s*\\\|/g, '‖');

  // Named LaTeX commands: \alpha → α, \cdot → ·, etc.
  result = result.replace(/\\([a-zA-Z]+)/g, (_m, cmd) =>
    LATEX_COMMANDS[cmd as string] ?? `\\${cmd as string}`,
  );

  // Escaped braces: \{ \} → { }
  result = result.replace(/\\([{}])/g, '$1');

  // Clean up extra spaces
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Quick check: does the text likely contain LaTeX math?
const LATEX_HINT_RE = /\$|\\\(|\\\[|\\[a-zA-Z]{2,}/;

/**
 * Pre-processes text to convert LaTeX math notation to Unicode.
 * Handles both display math ($$...$$) and inline math ($...$).
 *
 * Should be applied before the markdown parser runs.
 */
export function latexToUnicode(text: string): string {
  // Fast path: no LaTeX indicators
  if (!LATEX_HINT_RE.test(text)) {
    return text;
  }

  let result = text;

  // Display math: $$...$$ → convert content, remove delimiters
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_m, content) =>
    convertMathContent(content as string),
  );

  // \[...\] display math
  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_m, content) =>
    convertMathContent(content as string),
  );

  // \(...\) inline math
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_m, content) =>
    convertMathContent(content as string),
  );

  // Inline math: $...$
  // Avoid matching currency like "$100" or empty "$$" (already handled above).
  result = result.replace(/\$([^\s$](?:[^$]*[^\s$])?)\$/g, (_m, content) =>
    convertMathContent(content as string),
  );

  return result;
}
