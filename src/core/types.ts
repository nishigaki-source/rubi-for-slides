/**
 * core 層の型定義。
 *
 * この層は DOM にも kuromoji にも依存しない。
 * 「形態素解析済みのトークン列」を入力とし、「ルビ割り当て結果」を出力する
 * 純粋なロジックだけを扱う（PLAN.md 3.4節を参照）。
 */

/** 1 形態素（トークン）。kuromoji の出力を想定しているが、この型自体は
 * kuromoji に依存しない（worker 層で変換してから core に渡す）。 */
export interface TokenizedWord {
  /** 表層形（実際にスライド上に表示されている文字列） */
  surface: string;
  /**
   * 読み（カタカナ）。kuromoji が読みを決定できなかった場合は
   * undefined または "*"（kuromoji の未知語マーカー）になりうる。
   */
  reading?: string | undefined;
  /** 品詞（フィルタリングに使う場合に備えて保持。現状は未使用） */
  pos?: string | undefined;
}

/**
 * 単語単位でルビの見た目を個別上書きするための設定(PLAN.md 3.7節)。
 * 各項目とも省略時は全体設定(popup)の値にフォールバックする。
 */
export interface RubyStyleOverride {
  fontFamily?: string;
  color?: string;
  /** 全体設定の sizeRatio をこの単語だけ上書きする */
  sizeRatio?: number;
}

/**
 * ルビを付与する区間。surface 文字列内のインデックス範囲 [start, end) に対して
 * ひらがなの読み kana を対応付ける。
 *
 * 例: surface="食べる" の場合、[{start:0, end:1, kana:"た"}] は
 * 「食」の真上に「た」というルビを振ることを意味する（「べる」にはルビを振らない）。
 */
export interface RubyRange {
  /** surface 内の開始インデックス（この文字を含む） */
  start: number;
  /** surface 内の終了インデックス（この文字を含まない） */
  end: number;
  /** この区間に振るひらがなの読み */
  kana: string;
  /** ユーザー辞書による見た目の個別上書き(指定が無ければ全体設定を使う) */
  style?: RubyStyleOverride;
}

/** 1 トークンに対するルビ付与結果。 */
export interface RubyToken {
  /** 元の表層形 */
  surface: string;
  /** ルビ区間の配列。ルビ不要なトークン（漢字を含まない等）は空配列になる。 */
  rubyRanges: RubyRange[];
}

/**
 * ユーザー辞書の1エントリ。読み・見た目のどちらか一方、または両方を指定できる
 * (PLAN.md 3.7節、2026-09-17決定)。
 */
export interface UserDictEntry {
  /** ひらがなの読み上書き(省略時は kuromoji の読みをそのまま使う) */
  reading?: string;
  /** この単語だけの見た目の上書き */
  style?: RubyStyleOverride;
}

/** ユーザー辞書。表層形の完全一致で読み・見た目を上書きする。 */
export type UserDictionary = Record<string, UserDictEntry>;

/**
 * 学年別漢字配当表。1 文字の漢字をキーに、その漢字を習う学年（1〜6）を返す。
 * 表に存在しない漢字（教育漢字以外の常用漢字など）は「学年不明」として扱い、
 * 学年フィルタでは常にルビ付与の対象とする（安全側に倒す）。
 */
export type KanjiGradeTable = Record<string, number>;

/** 学年フィルタの設定。省略時はフィルタなし（既定値、全漢字にルビを振る）。 */
export interface GradeFilterOptions {
  /** この学年以下で習う漢字だけで構成されるトークンにはルビを振らない */
  maxGrade: number;
  /** 学年別漢字配当表 */
  gradeTable: KanjiGradeTable;
}

export interface ReadingServiceOptions {
  /** 学年フィルタ。省略時は全漢字にルビを振る（既定動作、PLAN.md 決定事項参照） */
  gradeFilter?: GradeFilterOptions;
  /** ユーザー辞書。学年フィルタより優先される。 */
  userDict?: UserDictionary;
}
