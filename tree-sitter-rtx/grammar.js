function listof(thing, sep) {
  return seq(thing, repeat(seq(sep, thing)));
}

function operator(s, fold) {
  if(fold) {
    var plain = operator(s, false);
    var cl = operator(s + "cl", false);
    var caseless = operator(s + "caseless", false);
    var fold = operator(s + "fold", false);
    var foldcase = operator(s + "foldcase", false);
    return new RegExp(plain.source + "|" +
                      cl.source + "|" + caseless.source + "|" +
                      fold.source + "|" + foldcase.source);
  } else {
    var ret = "[-_]*";
    for(var i = 0; i < s.length; i++) {
      if(s.codePointAt(i) >= 97 && s.codePointAt(i) <= 122) {
        ret += "[" + s[i].toUpperCase() + s[i] + "]";
      } else {
        ret += s[i];
      }
      ret += "[-_]*";
    }
    return new RegExp(ret);
  }
}

function condtype(key) {
  return $ => seq(
    "(",
    choice(
      seq(
        $.always_tok,
        $[key]
      ),
      seq(
        $.if_tok,
        $.condition,
        $[key],
        repeat(seq(
          $.elif_tok,
          $.condition,
          $[key]
        )),
        optional(seq(
          $.else_tok,
          $[key]
        ))
      )
    ),
    ")"
  );
}

module.exports = grammar({
  name: "rtx",

  extras: $ => [
    $.comment,
    /[\s\n]/
  ],

  rules: {
    source_file: $ => repeat(choice(
      $.attr_rule,
      $.output_rule,
      $.retag_rule,
      $.reduce_rule_group
    )),

    arrow: $ => prec(2, /->|→/),

    string: $ => /"([^\"]|\\.)*"/,
    ident: $ => /([^!@$%()={}\[\]|\/:;<>,.→\s\n\d\"]|\\.)([^!@$%()={}\[\]|\/:;<>,.→\s\n]|\\.)*/,

    comment: $ => /![^\n]*/,

    num: $ => prec(2, /\d+/),

    weight: $ => /\d+(\.\d+)?/,

    attr_prefix: $ => "$",
    global_var_prefix: $ => "$$",
    global_str_prefix: $ => "$%",

    magic: $ => "%",

    colon: $ => ":",

    lit_tag: $ => seq("<", $.ident, ">"),

    output_rule: $ => seq(
      field('pos', $.ident),
      $.colon,
      optional($.colon),
      choice(
        $.lu_cond,
        $.magic,
        listof(
          choice(
            $.ident,
            $.lit_tag,
          ),
          "."
        )
      ),
      ";"
    ),

    attr_set_insert: $ => seq("[", $.ident, "]"),

    attr_pair: $ => seq(
      field('src', choice($.ident, $.string, $.attr_set_insert)),
      field('trg', choice($.ident, $.string))
    ),

    retag_rule: $ => seq(
      field('src_attr', $.ident),
      ">",
      field('trg_attr', $.ident),
      ":",
      listof($.attr_pair, ","),
      ";"
    ),

    attr_default: $ => seq(
      "(",
      field('src', $.ident),
      field('trg', choice($.ident, $.string)),
      ")"
    ),

    attr_rule: $ => seq(
      field('name', $.ident),
      "=",
      optional($.attr_default),
      repeat1(choice(
        $.ident,
        $.string,
        seq("@", $.ident),
        $.attr_set_insert,
      )),
      ";"
    ),

    clip_side: $ => token(seq("/", choice("sl", "tl", "ref"))),

    insert: $ => "<",
    inserted: $ => ">",

    clip: $ => choice(
      seq(
        choice(
          seq(
            field('inserted', optional($.inserted)),
            field('pos', $.num),
            "."
          ),
          field('pos', $.attr_prefix),
          seq(
            $.global_var_prefix,
            field('var_name', $.ident),
            "."
          )
        ),
        field('attr', $.ident),
        field('side', optional($.clip_side)),
        optional(seq(">", field('convert', $.ident)))
      ),
      seq(
        $.global_str_prefix,
        field('var_name', $.ident)
      ),
      field('val', $.ident)
    ),

    str_op: $ => choice(
      operator("equal", true),
      operator("=", true),

      operator("isprefix", true),
      operator("startswith", true),
      operator("beginswith", true),
      operator("hasprefix", true),
      operator("startswithlist", true),
      operator("beginswithlist", true),

      operator("issuffix", true),
      operator("endswith", true),
      operator("hassuffix", true),
      operator("endswithlist", true),

      operator("in", true),
      operator("∈", true),

      operator("issubstring", true),
      operator("contains", false)
    ),

    and: $ => choice(
      operator("and", false),
      operator("&", false)
    ),

    or: $ => choice(
      operator("or", false),
      /[-_]*\|[-_]*/
    ),

    not: $ => prec(2, choice(
      token(prec(2, operator("not", false))),
      token(prec(2, operator("~", false))),
      token(prec(2, operator("⌐", false)))
    )),

    _string_val: $ => choice(
      $.clip,
      $.string,
      $.string_cond
    ),

    _cond_base_bool: $ => seq(
      $._string_val,
      optional($.not),
      $.str_op,
      $._string_val
    ),

    _cond_bool: $ => choice(
      $._cond_base_bool,
      prec(3, seq("(", $._cond_bool, ")")),
      prec(2, seq($.not, $._cond_bool)),
      prec.left(1, seq($._cond_bool, choice($.and, $.or), $._cond_bool))
    ),

    condition: $ => seq(
      "(",
      optional($.not),
      $._cond_bool,
      ")"
    ),

    pattern_element: $ => seq(
      optional($.magic),
      optional(seq(
        field(
          'lemma',
          choice(
            seq($.attr_prefix, $.ident),
            $.attr_set_insert,
            $.ident,
            $.string
          ),
        ),
        "@"
      )),
      $.ident,
      repeat(seq(
        ".",
        choice(
          $.ident,
          seq("$", $.ident, optional($.clip_side)),
          $.attr_set_insert,
          $.string
        )
      ))
    ),

    unknown: $ => "*",

    set_var: $ => seq(
      field('name', $.ident),
      "=",
      field('value', $._string_val)
    ),

    output_var_set: $ => seq(
      token.immediate("["),
      listof($.set_var, ","),
      "]"
    ),

    macro_name: $ => seq(
      token.immediate("("),
      $.ident,
      ")"
    ),

    literal_lu: $ => seq(
      field('lemma', choice($.ident, $.string)),
      token.immediate("@"),
      listof(
        choice(
          field('lit_tag', $.ident),
          field('parent_tag', seq("$", $.ident)),
          field('complex_tag', seq("[", choice($.clip, $.string_cond), "]")),
          field('lemcase', seq("{", $.clip, "}"))
        ),
        "."
      ),
      field('vars', optional($.output_var_set))
    ),

    conjoin: $ => "+",
    null_lu: $ => "*",

    output_element: $ => seq(
      optional(choice($.conjoin, $.insert)),
      choice(
        seq(
          optional($.inserted),
          optional($.magic),
          choice(
            $.num,
            $.ident,
            $.string,
            $.null_lu,
          ),
          optional($.macro_name),
          optional($.output_var_set)
        ),
        seq($.global_var_prefix, $.ident),
        $.literal_lu
      )
    ),

    blank: $ => "_",
    numbered_blank: $ => /_\d+/,

    if_tok: $ => operator("if", false),
    elif_tok: $ => choice(
      operator("if", false),
      operator("elif", false),
      operator("elseif", false)
    ),
    else_tok: $ => choice(
      operator("else", false),
      operator("otherwise", false)
    ),
    always_tok: $ => operator("always", false),

    string_cond: condtype("_string_val"),
    chunk_cond: condtype("_chunk_val"),
    lu_cond: condtype("_lu_val"),

    reduce_output: $ => choice(
      seq(
        "{",
        repeat(choice(
          $._lu_val,
          $._chunk_val
        )),
        "}"
      ),
      $.chunk_cond
    ),

    output_chunk: $ => seq(
      "{",
      repeat($._lu_val),
      "}"
    ),

    _chunk_val: $ => choice(
      $.output_chunk,
      $.chunk_cond
    ),

    _lu_val: $ => choice(
      $.output_element,
      $.blank,
      $.numbered_blank,
      $.lu_cond,
      seq("[", repeat($._lu_val), "]")
    ),

    reduce_rule_group: $ => seq(
      repeat1($.ident),
      $.arrow,
      listof($.reduce_rule, "|"),
      ";"
    ),

    set_surf: $ => seq(
      "$",
      $.num,
      field('side', $.clip_side),
      "=",
      $._lu_val
    ),

    set_global_var: $ => seq(
      $.global_var_prefix,
      field('name', $.ident),
      "=",
      field('value', $._lu_val)
    ),

    set_global_str: $ => seq(
      $.global_str_prefix,
      field('name', $.ident),
      "=",
      field('value', $._string_val)
    ),

    set_chunk_attr: $ => seq(
      $.attr_prefix,
      field('name', $.ident),
      "=",
      field('value', $._string_val)
    ),

    reduce_rule: $ => seq(
      field('rule_name', optional($.string)),
      field('weight', optional(seq($.weight, ":"))),
      field('pattern', repeat1(choice($.unknown, $.pattern_element))),
      field('cond', optional(seq("?", $.condition))),
      optional(seq(
        "[",
        listof(
          choice(
            $.set_surf,
            $.set_global_var,
            $.set_global_str,
            $.set_chunk_attr,
          ),
          ","
        ),
        "]"
      )),
      field('output', $.reduce_output)
    )
  }
})
