// new flat file configuration for eslint
// https://eslint.org/docs/latest/use/configure/configuration-files-new

const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            globals: {
                ...globals.node
            }
        },
        "rules": {
            "semi": [
                "error",
                "always"
            ],
            "no-extra-parens": "error",
            "default-case": "error",
            "curly": "error",
            "eqeqeq": "warn",
            "no-loop-func": "error",
            "no-sequences": "error",
            "key-spacing": "error",
            "yoda": [
                "error",
                "never"
            ],
            "array-bracket-spacing": [
                "error",
                "never"
            ],
            "block-spacing": [
                "error",
                "always"
            ],
            "eol-last": [
                "error",
                "always"
            ],
            "func-call-spacing": [
                "error",
                "never"
            ],
            "newline-after-var": [
                "error",
                "always"
            ],
            "no-lonely-if": "error",
            "no-trailing-spaces": "error",
            "no-whitespace-before-property": "error",
            "space-infix-ops": "error",
            "no-mixed-spaces-and-tabs": "error",
            "no-plusplus": [
                "error",
                {
                    "allowForLoopAfterthoughts": true
                }
            ]
        }
    }
]
