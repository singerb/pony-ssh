export = index;
declare class index {
    static DIFF_DELETE: number;
    static DIFF_EQUAL: number;
    static DIFF_INSERT: number;
    static blanklineEndRegex_: RegExp;
    static blanklineStartRegex_: RegExp;
    // Circular reference from index
    static diff_match_patch: any;
    static linebreakRegex_: RegExp;
    static nonAlphaNumericRegex_: RegExp;
    static patch_obj(): void;
    static whitespaceRegex_: RegExp;
    Diff_Timeout: any;
    Diff_EditCost: any;
    Match_Threshold: any;
    Match_Distance: any;
    Patch_DeleteThreshold: any;
    Patch_Margin: any;
    Match_MaxBits: any;
    diff_bisectSplit_(text1: any, text2: any, x: any, y: any, deadline: any): any;
    diff_bisect_(text1: any, text2: any, deadline: any): any;
    diff_charsToLines_(diffs: any, lineArray: any): void;
    diff_cleanupEfficiency(diffs: any): void;
    diff_cleanupMerge(diffs: any): void;
    diff_cleanupSemantic(diffs: any): void;
    diff_cleanupSemanticLossless(diffs: any): void;
    diff_commonOverlap_(text1: any, text2: any): any;
    diff_commonPrefix(text1: any, text2: any): any;
    diff_commonSuffix(text1: any, text2: any): any;
    diff_compute_(text1: any, text2: any, checklines: any, deadline: any): any;
    diff_fromDelta(text1: any, delta: any): any;
    diff_halfMatch_(text1: any, text2: any): any;
    diff_levenshtein(diffs: any): any;
    diff_lineMode_(text1: any, text2: any, deadline: any): any;
    diff_linesToChars_(text1: any, text2: any): any;
    diff_main(text1: any, text2: any, opt_checklines: any, opt_deadline: any): any;
    diff_prettyHtml(diffs: any): any;
    diff_text1(diffs: any): any;
    diff_text2(diffs: any): any;
    diff_toDelta(diffs: any): any;
    diff_xIndex(diffs: any, loc: any): any;
    match_alphabet_(pattern: any): any;
    match_bitap_(text: any, pattern: any, loc: any): any;
    match_main(text: any, pattern: any, loc: any): any;
    patch_addContext_(patch: any, text: any): void;
    patch_addPadding(patches: any): any;
    patch_apply(patches: any, text: any): any;
    patch_deepCopy(patches: any): any;
    patch_fromText(textline: any): any;
    patch_make(a: any, opt_b: any, opt_c: any): any;
    patch_splitMax(patches: any): void;
    patch_toText(patches: any): any;
}
