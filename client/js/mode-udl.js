window.define = window.define || ace.define;

define('ace/mode/udl', function(require, exports, module) {

    console.log("Loaded: ace/mode/udl");

    var oop = require("ace/lib/oop");
    var TextMode = require("ace/mode/text").Mode;
    var Foo = require("ace/tokenizer");
    var Tokenizer = require("ace/tokenizer").Tokenizer;
    var HighlightRules = require("ace/mode/udl_highlight_rules").UDLHighlightRules;
    //var HighlightRules = require("ace/mode/javascript_highlight_rules").JavaScriptHighlightRules;

    var Mode = function() {
        highlightRules = new HighlightRules();
        this.$tokenizer = new Tokenizer(highlightRules.getRules());     

        var _this          = this.$tokenizer;
        var _getLineTokens = this.$tokenizer.getLineTokens;

        this.$tokenizer.getLineTokens = function(line,startstate,row) {
            var tokens = null;

            if (window.bigfoot != undefined) {
                // Get the tokens for this line from bigfoot
                var raw_tokens = window.bigfoot.updateTextModel("lang:CDL", row, line);

                if (raw_tokens != undefined) {
                    tokens = highlightRules.processRawTokens(raw_tokens);
                }
            }

            if (tokens == null) {
                tokens = _getLineTokens.call(_this,line,startstate,row);
                // console.log("getLineTokens("+row+","+line+","+startstate+")"); //:\n" + JSON.stringify(lt));
            }

            return tokens;
        };
    };
    oop.inherits(Mode, TextMode);

    (function() {
        // Extra logic goes here. (see below)
    }).call(Mode.prototype);

    exports.Mode = Mode;
});

define('ace/mode/udl_highlight_rules', function(require, exports, module) {

    var oop = require("ace/lib/oop");
    var TextHighlightRules = require("ace/mode/text_highlight_rules").TextHighlightRules;

    var UDLHighlightRules = function() {

        this.$rules = new TextHighlightRules().getRules();

        this.tokenMap = {
            // Common values
            0x00: "invalid.illegal",        // T_ERROR
            0x01: "text",                   // T_NORMAL
            0x02: "text",                   // T_TAB

            // CoS
            0x403: "entity.name.tag",       // T_LABEL,                  
            0x404: "constant.language",     // T_DOTS,                   
            0x405: "entity.name.function",  // T_OBJCLASS,               
            0x406: "constant.string",       // T_STRING,                 
            0x407: "comment",               // T_COMMENT,                
            0x408: "constant.language",     // T_OBJECT,                 
            0x409: "function.buildin",      // T_SQL,                    
            0x40a: "function.buildin",      // T_PPFUNC,                 
            0x40b: "function.buildin",      // T_PPCOMM,                 
            0x40c: "constant.other",        // T_MACRO,                  
            0x40d: "constant.language",     // T_DELIM,                  
            0x40e: "entity.name.function",  // T_EXTERNAL,               
            0x40f: "function",              // T_EXTRINSIC,              
            0x410: "constant.language",     // T_FORMAT,                 
            0x411: "function",              // T_FUNCTION,               
            0x412: "variable",              // T_GLOBAL,                 
            0x413: "variable",              // T_INDIRECT,               
            0x414: "variable",              // T_LOCAL,                  
            0x415: "constant.language",     // T_MNEMONIC,               
            0x416: "entity.name",           // T_NAME,                   
            0x417: "constant.numeric",      // T_NUMBER,                 
            0x418: "keyword.operator",      // T_OPERATOR,               
            0x419: "function",              // T_ROUTINE,                
            0x41a: "keyword.operator",      // T_SPECIAL,                
            0x41b: "function.buildin",      // T_STRUCTURED,             
            0x41c: "function.buildin",      // T_SYSTEMVARIABLE,         
            0x41d: "function.buildin",      // T_HTML,                   
            0x41e: "variable.parameter",    // T_OBJPARAMETER,           
            0x41f: "entity.name",           // T_OBJNAME,                
            0x420: "keyword",               // T_COMMAND,                
            0x421: "variable",              // T_OBJINSTANCE,            
            0x422: "entity.name",           // T_OBJREFERENCE,           
            0x423: "function",              // T_OBJMETHOD,              
            0x424: "variable",              // T_OBJATTRIBUTE,           
            0x425: "function.buildin",      // T_OBJTHIS,                
            0x426: "variable",              // T_VBFORM,                 
            0x427: "variable",              // T_VBCONTROL,              
            0x428: "variable",              // T_VBPROPERTY,                             
            0x429: "constant.language",     // T_PATTERN,                
            0x42a: "paren",                 // T_BRACE,                  
            0x42b: "function.buildin",      // T_JAVASCRIPT,             
            0x42c: "constant.language",     // T_CSPEXTENSION,           
            0x42d: "function.buildin",      // T_OBJSUPER,               
            0x42e: "variable",              // T_LOCALPRIVATE,           
            0x42f: "constant.language",     // T_OPTIONTRACK,            
            0x430: "variable",              // T_LOCALPARAMETER,         
            0x431: "variable",              // T_LOCALUNDECLARED,        
            0x432: "text",                  // T_NEUTRAL,                
            0x433: "comment",               // T_DOCCOMMENT,             
            0x434: "function.buildin",      // T_UNZCOMMAND,             
            0x435: "function.buildin",      // T_UNZFUNCTION,            
            0x436: "function.buildin",      // T_UNZVARIABLE,
            0x437: "variable",              // T_OBJMEMBER,

            // Cache SQL
            0x803: "constant.language",     // T_DELIM,                  
            0x804: "constant.string",       // T_STRING,                 
            0x805: "comment",               // T_COMMENT,                
            0x806: "constant.numeric",      // T_INTLIT,                 
            0x807: "constant.numeric",      // T_FLOATLIT,               
            0x808: "entity.name",           // T_IDENTIFIER,             
            0x809: "variable",              // T_HOSTVARNAME,            
            0x80A: "variable",              // T_HOSTINSTNAME,           
            0x80B: "variable",              // T_HOSTEXTRINSIC,          
            0x80C: "keyword.operator",      // T_OPERATOR,               
            0x80D: "function",              // T_SCALARFUN,              
            0x80E: "function",              // T_ODBCFUN,                
            0x80F: "function.buildin",      // T_AGGFUN,                 
            0x810: "constant.language",     // T_DATATYPE,               
            0x811: "keyword",               // T_STATKEYWORD,            
            0x812: "keyword",               // T_QUALKEYWORD,            
            0x813: "keyword",               // T_EXPRKEYWORD,            
            0x814: "text",                  // T_CSPORPPEXTENSION,       
            0x815: "variable",              // T_HOSTREFVARNAME          

            // Cache UDL
            0xC03: "keyword",               // T_CLASSMEMBER,
            0xC04: "keyword",               // T_KEYWORD,
            0xC05: "entity.name",           // T_CLASSNAME,
            0xC06: "comment",               // T_COMMENT,
            0xC07: "comment.documentation", // T_DESCRIPTION,
            0xC08: "meta",                  // T_DELIM,
            0xC09: "constant.numeric",      // T_NUMBER,
            0xC0A: "constant.string",       // T_STRING,
            0xC0B: "entity.name",           // T_NAME,
            0xC0C: "entity.name",           // T_SQLNAME,
            0xC0D: "entity.name",           // T_RTNNAME,

            // Storage XML in UDL (NOT XData)
            0xC0E: "entity.other.attribute-name",   // T_XMLATTVALUE,
            0xC0F: "xml.pe",                        // T_XMLCDATA,
            0xC10: "meta.name.tag",                 // T_XMLENTITY,
            0xC11: "constant.character.entity",     // T_XMLENTITYVALUE,
            0xC12: "constant.character.escape",     // T_XMLESCSEQ,
            0xC13: "text",                          // T_XMLPIVALUE,
            0xC14: "xml.pe",                        // T_XMLPUBIDLITERAL,
            0xC15: "meta.name",                     // T_XMLSYSTEMLITERAL,
            0xC16: "text",                          // T_XMLTEXT,

            0xC17: "variable.parameter",    // T_CLASSPARAMETER,
            0xC18: "variable.parameter",    // T_FORMALARGUMENT

            // XML 0x24xx
            0x2403: "meta.tag",                     // T_TAGDELIM,                 
            0x2404: "meta.tag",                     // T_DTDDELIM,                 
            0x2405: "meta.tag.tag-name",            // T_ELEMENTNAME,              
            0x2406: "entity.other.attribute-name",  // T_ATTRIBUTENAME,            
            0x2407: "entity.other.attribute-name",  // T_OTHERNAME,                
            0x2408: "meta.tag.sgml.doctype",        // T_DTDNAME,                  
            0x2409: "meta.tag.sgml.doctype",        // T_DTDKEYWORD,               
            0x240A: "entity.name",                  // T_ENTITYREF,                
            0x240B: "meta.tag",                     // T_PEREF,                    
            0x240C: "meta.tag",                     // T_CHARREF,                  
            0x240D: "keyword.operator",             // T_PIDELIM,                  
            0x240E: "text",                         // T_PICONTENT,                
            0x240F: "comment",                      // T_COMMENT,                  
            0x2410: "text",                         // T_TEXT,                     
            0x2411: "constant.string",              // T_STRING,                   
            0x2412: "invalid.deprecated",           // T_GRAYOUT,                  
            0x2413: "function.buildin",             // T_INDIRECTION               

            // End of attributes
            0xFFFF: "text"
        };

        this.processRawTokens = function(raw) {
            var tokens = [];
            for (var i = 0; i < raw.length; i++) {
                var token = raw[i];
                var low   = token.code & 0xFF;
                var name  = this.tokenMap[(low < 3) ? low : token.code];

                if (name == undefined) {
                    console.log("WARNING: Undefined token " + token.code + ": " + token.text);
                    name = "text";
                }

                tokens.push({
                    type:  name,
                    value: token.text
                })
            }

            return {"tokens":tokens, "state":"start"};
        };

    }

    oop.inherits(UDLHighlightRules, TextHighlightRules);

    exports.UDLHighlightRules = UDLHighlightRules;
});