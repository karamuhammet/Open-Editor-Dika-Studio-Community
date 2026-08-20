(function(){
  'use strict';
  var FONT_CATALOG = [
    {
        "family":  "Roboto",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Roboto"
    },
    {
        "family":  "Open Sans",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "Open Sans"
    },
    {
        "family":  "Google Sans",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Google Sans"
    },
    {
        "family":  "Inter",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Inter"
    },
    {
        "family":  "Montserrat",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Montserrat"
    },
    {
        "family":  "Poppins",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Poppins"
    },
    {
        "family":  "Noto Sans JP",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Sans JP"
    },
    {
        "family":  "Lato",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        300,
                        400,
                        700,
                        900
                    ],
        "italic":  true,
        "preview":  "Lato"
    },
    {
        "family":  "Material Icons",
        "category":  "Monospace",
        "weights":  400,
        "italic":  false,
        "preview":  "Material Icons"
    },
    {
        "family":  "Arimo",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Arimo"
    },
    {
        "family":  "Roboto Condensed",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Roboto Condensed"
    },
    {
        "family":  "Roboto Mono",
        "category":  "Monospace",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Roboto Mono"
    },
    {
        "family":  "Oswald",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Oswald"
    },
    {
        "family":  "Noto Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Noto Sans"
    },
    {
        "family":  "Raleway",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Raleway"
    },
    {
        "family":  "Nunito",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Nunito"
    },
    {
        "family":  "Nunito Sans",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Nunito Sans"
    },
    {
        "family":  "Playfair Display",
        "category":  "Serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Playfair Display"
    },
    {
        "family":  "DM Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "DM Sans"
    },
    {
        "family":  "Rubik",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Rubik"
    },
    {
        "family":  "Ubuntu",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        700
                    ],
        "italic":  true,
        "preview":  "Ubuntu"
    },
    {
        "family":  "Roboto Slab",
        "category":  "Serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Roboto Slab"
    },
    {
        "family":  "Noto Sans KR",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Sans KR"
    },
    {
        "family":  "Merriweather",
        "category":  "Serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Merriweather"
    },
    {
        "family":  "Work Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Work Sans"
    },
    {
        "family":  "Archivo Black",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Archivo Black"
    },
    {
        "family":  "Material Symbols Outlined",
        "category":  "Monospace",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Material Symbols Outlined"
    },
    {
        "family":  "Kanit",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Kanit"
    },
    {
        "family":  "PT Sans",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        700
                    ],
        "italic":  true,
        "preview":  "PT Sans"
    },
    {
        "family":  "Noto Sans TC",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Sans TC"
    },
    {
        "family":  "Lora",
        "category":  "Serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Lora"
    },
    {
        "family":  "Manrope",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Manrope"
    },
    {
        "family":  "Mulish",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Mulish"
    },
    {
        "family":  "Outfit",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Outfit"
    },
    {
        "family":  "Figtree",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Figtree"
    },
    {
        "family":  "Fjalla One",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Fjalla One"
    },
    {
        "family":  "Bebas Neue",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Bebas Neue"
    },
    {
        "family":  "Prompt",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Prompt"
    },
    {
        "family":  "Barlow",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Barlow"
    },
    {
        "family":  "Quicksand",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Quicksand"
    },
    {
        "family":  "Fira Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Fira Sans"
    },
    {
        "family":  "Saira",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Saira"
    },
    {
        "family":  "IBM Plex Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "IBM Plex Sans"
    },
    {
        "family":  "Titillium Web",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        600,
                        700,
                        900
                    ],
        "italic":  true,
        "preview":  "Titillium Web"
    },
    {
        "family":  "Heebo",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Heebo"
    },
    {
        "family":  "Bungee",
        "category":  "Display",
        "weights":  400,
        "italic":  false,
        "preview":  "Bungee"
    },
    {
        "family":  "Jost",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Jost"
    },
    {
        "family":  "Share Tech",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Share Tech"
    },
    {
        "family":  "Smooch Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Smooch Sans"
    },
    {
        "family":  "Noto Serif",
        "category":  "Serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Noto Serif"
    },
    {
        "family":  "Archivo",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Archivo"
    },
    {
        "family":  "Karla",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "Karla"
    },
    {
        "family":  "Bricolage Grotesque",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Bricolage Grotesque"
    },
    {
        "family":  "Plus Jakarta Sans",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "Plus Jakarta Sans"
    },
    {
        "family":  "PT Serif",
        "category":  "Serif",
        "weights":  [
                        400,
                        700
                    ],
        "italic":  true,
        "preview":  "PT Serif"
    },
    {
        "family":  "Material Icons Outlined",
        "category":  "Monospace",
        "weights":  400,
        "italic":  false,
        "preview":  "Material Icons Outlined"
    },
    {
        "family":  "Source Sans 3",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Source Sans 3"
    },
    {
        "family":  "Noto Color Emoji",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Noto Color Emoji"
    },
    {
        "family":  "Source Code Pro",
        "category":  "Monospace",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Source Code Pro"
    },
    {
        "family":  "Dancing Script",
        "category":  "Handwriting",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Dancing Script"
    },
    {
        "family":  "Inconsolata",
        "category":  "Monospace",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Inconsolata"
    },
    {
        "family":  "Libre Baskerville",
        "category":  "Serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Libre Baskerville"
    },
    {
        "family":  "Josefin Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Josefin Sans"
    },
    {
        "family":  "Cairo",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Cairo"
    },
    {
        "family":  "Gravitas One",
        "category":  "Display",
        "weights":  400,
        "italic":  false,
        "preview":  "Gravitas One"
    },
    {
        "family":  "Noto Serif JP",
        "category":  "Serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Serif JP"
    },
    {
        "family":  "Noto Sans SC",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Sans SC"
    },
    {
        "family":  "Changa One",
        "category":  "Display",
        "weights":  400,
        "italic":  true,
        "preview":  "Changa One"
    },
    {
        "family":  "Barlow Condensed",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Barlow Condensed"
    },
    {
        "family":  "EB Garamond",
        "category":  "Serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "EB Garamond"
    },
    {
        "family":  "Libre Franklin",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Libre Franklin"
    },
    {
        "family":  "Anton",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Anton"
    },
    {
        "family":  "Lobster Two",
        "category":  "Display",
        "weights":  [
                        400,
                        700
                    ],
        "italic":  true,
        "preview":  "Lobster Two"
    },
    {
        "family":  "Roboto Flex",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Roboto Flex"
    },
    {
        "family":  "Dosis",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Dosis"
    },
    {
        "family":  "Nanum Gothic",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Nanum Gothic"
    },
    {
        "family":  "Public Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Public Sans"
    },
    {
        "family":  "Assistant",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Assistant"
    },
    {
        "family":  "Cabin",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Cabin"
    },
    {
        "family":  "Bitter",
        "category":  "Serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Bitter"
    },
    {
        "family":  "Ramabhadra",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Ramabhadra"
    },
    {
        "family":  "Schibsted Grotesk",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Schibsted Grotesk"
    },
    {
        "family":  "Alfa Slab One",
        "category":  "Display",
        "weights":  400,
        "italic":  false,
        "preview":  "Alfa Slab One"
    },
    {
        "family":  "Noto Sans Telugu",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Sans Telugu"
    },
    {
        "family":  "Anek Telugu",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Anek Telugu"
    },
    {
        "family":  "Space Grotesk",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Space Grotesk"
    },
    {
        "family":  "Material Symbols Rounded",
        "category":  "Monospace",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Material Symbols Rounded"
    },
    {
        "family":  "Cormorant Garamond",
        "category":  "Serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Cormorant Garamond"
    },
    {
        "family":  "Hind Siliguri",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Hind Siliguri"
    },
    {
        "family":  "Material Icons Round",
        "category":  "Monospace",
        "weights":  400,
        "italic":  false,
        "preview":  "Material Icons Round"
    },
    {
        "family":  "Tajawal",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Tajawal"
    },
    {
        "family":  "Pacifico",
        "category":  "Handwriting",
        "weights":  400,
        "italic":  false,
        "preview":  "Pacifico"
    },
    {
        "family":  "Red Hat Display",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Red Hat Display"
    },
    {
        "family":  "M PLUS Rounded 1c",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        300,
                        400,
                        500,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "M PLUS Rounded 1c"
    },
    {
        "family":  "Instrument Serif",
        "category":  "Serif",
        "weights":  400,
        "italic":  true,
        "preview":  "Instrument Serif"
    },
    {
        "family":  "Hind",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Hind"
    },
    {
        "family":  "Lexend",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Lexend"
    },
    {
        "family":  "Exo 2",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Exo 2"
    },
    {
        "family":  "Oxygen",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        700
                    ],
        "italic":  false,
        "preview":  "Oxygen"
    },
    {
        "family":  "Lobster",
        "category":  "Display",
        "weights":  400,
        "italic":  false,
        "preview":  "Lobster"
    },
    {
        "family":  "Mukta",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Mukta"
    },
    {
        "family":  "Slabo 27px",
        "category":  "Serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Slabo 27px"
    },
    {
        "family":  "Arvo",
        "category":  "Serif",
        "weights":  [
                        400,
                        700
                    ],
        "italic":  true,
        "preview":  "Arvo"
    },
    {
        "family":  "Crimson Text",
        "category":  "Serif",
        "weights":  [
                        400,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Crimson Text"
    },
    {
        "family":  "Rajdhani",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Rajdhani"
    },
    {
        "family":  "Inter Tight",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Inter Tight"
    },
    {
        "family":  "Comfortaa",
        "category":  "Display",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Comfortaa"
    },
    {
        "family":  "Urbanist",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Urbanist"
    },
    {
        "family":  "PT Sans Narrow",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        700
                    ],
        "italic":  false,
        "preview":  "PT Sans Narrow"
    },
    {
        "family":  "Sora",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Sora"
    },
    {
        "family":  "Caveat",
        "category":  "Handwriting",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Caveat"
    },
    {
        "family":  "Asap",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Asap"
    },
    {
        "family":  "JetBrains Mono",
        "category":  "Monospace",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "JetBrains Mono"
    },
    {
        "family":  "Abel",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Abel"
    },
    {
        "family":  "Orbitron",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Orbitron"
    },
    {
        "family":  "Merriweather Sans",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "Merriweather Sans"
    },
    {
        "family":  "Overpass",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Overpass"
    },
    {
        "family":  "Barlow Semi Condensed",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Barlow Semi Condensed"
    },
    {
        "family":  "Source Serif 4",
        "category":  "Serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Source Serif 4"
    },
    {
        "family":  "Teko",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Teko"
    },
    {
        "family":  "Google Sans Flex",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Google Sans Flex"
    },
    {
        "family":  "DM Serif Display",
        "category":  "Serif",
        "weights":  400,
        "italic":  true,
        "preview":  "DM Serif Display"
    },
    {
        "family":  "Google Sans Code",
        "category":  "Monospace",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "Google Sans Code"
    },
    {
        "family":  "Material Icons Sharp",
        "category":  "Monospace",
        "weights":  400,
        "italic":  false,
        "preview":  "Material Icons Sharp"
    },
    {
        "family":  "Almarai",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Almarai"
    },
    {
        "family":  "Fredoka",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Fredoka"
    },
    {
        "family":  "Exo",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Exo"
    },
    {
        "family":  "M PLUS 1p",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        300,
                        400,
                        500,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "M PLUS 1p"
    },
    {
        "family":  "Play",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        700
                    ],
        "italic":  false,
        "preview":  "Play"
    },
    {
        "family":  "IBM Plex Mono",
        "category":  "Monospace",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "IBM Plex Mono"
    },
    {
        "family":  "Lilita One",
        "category":  "Display",
        "weights":  400,
        "italic":  false,
        "preview":  "Lilita One"
    },
    {
        "family":  "Noto Sans Arabic",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Sans Arabic"
    },
    {
        "family":  "Chakra Petch",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Chakra Petch"
    },
    {
        "family":  "Lexend Deca",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Lexend Deca"
    },
    {
        "family":  "Bodoni Moda",
        "category":  "Serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Bodoni Moda"
    },
    {
        "family":  "Cinzel",
        "category":  "Serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Cinzel"
    },
    {
        "family":  "Material Icons Two Tone",
        "category":  "Monospace",
        "weights":  400,
        "italic":  false,
        "preview":  "Material Icons Two Tone"
    },
    {
        "family":  "Shadows Into Light",
        "category":  "Handwriting",
        "weights":  400,
        "italic":  false,
        "preview":  "Shadows Into Light"
    },
    {
        "family":  "Varela Round",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Varela Round"
    },
    {
        "family":  "Maven Pro",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Maven Pro"
    },
    {
        "family":  "Indie Flower",
        "category":  "Handwriting",
        "weights":  400,
        "italic":  false,
        "preview":  "Indie Flower"
    },
    {
        "family":  "Instrument Sans",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Instrument Sans"
    },
    {
        "family":  "Abril Fatface",
        "category":  "Display",
        "weights":  400,
        "italic":  false,
        "preview":  "Abril Fatface"
    },
    {
        "family":  "Domine",
        "category":  "Serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Domine"
    },
    {
        "family":  "Noto Sans Thai",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Sans Thai"
    },
    {
        "family":  "Zen Kaku Gothic New",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        700,
                        900
                    ],
        "italic":  false,
        "preview":  "Zen Kaku Gothic New"
    },
    {
        "family":  "Saira Condensed",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Saira Condensed"
    },
    {
        "family":  "Questrial",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Questrial"
    },
    {
        "family":  "Fira Sans Condensed",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Fira Sans Condensed"
    },
    {
        "family":  "Zilla Slab",
        "category":  "Serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Zilla Slab"
    },
    {
        "family":  "Albert Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Albert Sans"
    },
    {
        "family":  "Marcellus",
        "category":  "Serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Marcellus"
    },
    {
        "family":  "Geist",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Geist"
    },
    {
        "family":  "Sofia Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Sofia Sans"
    },
    {
        "family":  "IBM Plex Serif",
        "category":  "Serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "IBM Plex Serif"
    },
    {
        "family":  "Unbounded",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Unbounded"
    },
    {
        "family":  "Onest",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Onest"
    },
    {
        "family":  "Nanum Myeongjo",
        "category":  "Serif",
        "weights":  [
                        400,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Nanum Myeongjo"
    },
    {
        "family":  "DM Mono",
        "category":  "Monospace",
        "weights":  [
                        300,
                        400,
                        500
                    ],
        "italic":  true,
        "preview":  "DM Mono"
    },
    {
        "family":  "Archivo Narrow",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Archivo Narrow"
    },
    {
        "family":  "Be Vietnam Pro",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Be Vietnam Pro"
    },
    {
        "family":  "Satisfy",
        "category":  "Handwriting",
        "weights":  400,
        "italic":  false,
        "preview":  "Satisfy"
    },
    {
        "family":  "Great Vibes",
        "category":  "Handwriting",
        "weights":  400,
        "italic":  false,
        "preview":  "Great Vibes"
    },
    {
        "family":  "Geist Mono",
        "category":  "Monospace",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Geist Mono"
    },
    {
        "family":  "Geologica",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Geologica"
    },
    {
        "family":  "Spectral",
        "category":  "Serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "Spectral"
    },
    {
        "family":  "Cormorant",
        "category":  "Serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Cormorant"
    },
    {
        "family":  "Epilogue",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Epilogue"
    },
    {
        "family":  "League Spartan",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "League Spartan"
    },
    {
        "family":  "Kalam",
        "category":  "Handwriting",
        "weights":  [
                        300,
                        400,
                        700
                    ],
        "italic":  false,
        "preview":  "Kalam"
    },
    {
        "family":  "Asap Condensed",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Asap Condensed"
    },
    {
        "family":  "Luckiest Guy",
        "category":  "Display",
        "weights":  400,
        "italic":  false,
        "preview":  "Luckiest Guy"
    },
    {
        "family":  "Noto Serif SC",
        "category":  "Serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Serif SC"
    },
    {
        "family":  "Noto Serif KR",
        "category":  "Serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Serif KR"
    },
    {
        "family":  "Rowdies",
        "category":  "Display",
        "weights":  [
                        300,
                        400,
                        700
                    ],
        "italic":  false,
        "preview":  "Rowdies"
    },
    {
        "family":  "Signika",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Signika"
    },
    {
        "family":  "Noto Kufi Arabic",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Kufi Arabic"
    },
    {
        "family":  "Vollkorn",
        "category":  "Serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Vollkorn"
    },
    {
        "family":  "IBM Plex Sans JP",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "IBM Plex Sans JP"
    },
    {
        "family":  "Space Mono",
        "category":  "Monospace",
        "weights":  [
                        400,
                        700
                    ],
        "italic":  true,
        "preview":  "Space Mono"
    },
    {
        "family":  "Permanent Marker",
        "category":  "Handwriting",
        "weights":  400,
        "italic":  false,
        "preview":  "Permanent Marker"
    },
    {
        "family":  "Roboto Serif",
        "category":  "Serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Roboto Serif"
    },
    {
        "family":  "IBM Plex Sans Arabic",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "IBM Plex Sans Arabic"
    },
    {
        "family":  "ABeeZee",
        "category":  "Sans-serif",
        "weights":  400,
        "italic":  true,
        "preview":  "ABeeZee"
    },
    {
        "family":  "Frank Ruhl Libre",
        "category":  "Serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Frank Ruhl Libre"
    },
    {
        "family":  "Noto Serif TC",
        "category":  "Serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  false,
        "preview":  "Noto Serif TC"
    },
    {
        "family":  "Fraunces",
        "category":  "Serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Fraunces"
    },
    {
        "family":  "Red Hat Text",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  true,
        "preview":  "Red Hat Text"
    },
    {
        "family":  "Alumni Sans",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Alumni Sans"
    },
    {
        "family":  "Yanone Kaffeesatz",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700
                    ],
        "italic":  false,
        "preview":  "Yanone Kaffeesatz"
    },
    {
        "family":  "Newsreader",
        "category":  "Serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "Newsreader"
    },
    {
        "family":  "Antic Slab",
        "category":  "Serif",
        "weights":  400,
        "italic":  false,
        "preview":  "Antic Slab"
    },
    {
        "family":  "Zen Maru Gothic",
        "category":  "Sans-serif",
        "weights":  [
                        300,
                        400,
                        500,
                        700,
                        900
                    ],
        "italic":  false,
        "preview":  "Zen Maru Gothic"
    },
    {
        "family":  "Sarabun",
        "category":  "Sans-serif",
        "weights":  [
                        100,
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "Sarabun"
    },
    {
        "family":  "Rethink Sans",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  true,
        "preview":  "Rethink Sans"
    },
    {
        "family":  "Syne",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Syne"
    },
    {
        "family":  "Alegreya",
        "category":  "Serif",
        "weights":  [
                        400,
                        500,
                        600,
                        700,
                        800,
                        900
                    ],
        "italic":  true,
        "preview":  "Alegreya"
    },
    {
        "family":  "News Cycle",
        "category":  "Sans-serif",
        "weights":  [
                        400,
                        700
                    ],
        "italic":  false,
        "preview":  "News Cycle"
    },
    {
        "family":  "Righteous",
        "category":  "Display",
        "weights":  400,
        "italic":  false,
        "preview":  "Righteous"
    },
    {
        "family":  "Changa",
        "category":  "Sans-serif",
        "weights":  [
                        200,
                        300,
                        400,
                        500,
                        600,
                        700,
                        800
                    ],
        "italic":  false,
        "preview":  "Changa"
    }
];
  window._GOOGLE_FONT_CATALOG = FONT_CATALOG;
  window._GOOGLE_FONTS_LIST = FONT_CATALOG.map(function(item){ return { name: item.family, category: item.category }; });
})();
