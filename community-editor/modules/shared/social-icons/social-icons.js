/* dika studio — Social & general icon library (Fabric.js) */

(function () {
  'use strict';

  /**
   * SVG path `d` values, viewBox 0 0 24 24. Use `paths` array for multi-part icons.
   * Each icon has a `category` field for filtering in the modal.
   */
  var SOCIAL_ICONS = [
    /* ── Social Media ───────────────────────────────────────── */
    {
      id: 'instagram',
      label: 'Instagram',
      keywords: 'instagram photo camera ig',
      category: 'Social Media',
      path:
        'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z',
    },
    {
      id: 'facebook',
      label: 'Facebook',
      keywords: 'facebook meta fb',
      category: 'Social Media',
      path:
        'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
    },
    {
      id: 'twitter',
      label: 'X (Twitter)',
      keywords: 'twitter x tweet',
      category: 'Social Media',
      path:
        'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      keywords: 'linkedin in jobs',
      category: 'Social Media',
      path:
        'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    },
    {
      id: 'tiktok',
      label: 'TikTok',
      keywords: 'tiktok video music',
      category: 'Social Media',
      path:
        'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
    },
    {
      id: 'youtube',
      label: 'YouTube',
      keywords: 'youtube video play google',
      category: 'Social Media',
      path:
        'M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      keywords: 'whatsapp chat message',
      category: 'Social Media',
      path:
        'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z',
    },
    {
      id: 'telegram',
      label: 'Telegram',
      keywords: 'telegram paper plane',
      category: 'Social Media',
      path:
        'M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
    },
    {
      id: 'pinterest',
      label: 'Pinterest',
      keywords: 'pinterest pin board',
      category: 'Social Media',
      path:
        'M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z',
    },
    {
      id: 'snapchat',
      label: 'Snapchat',
      keywords: 'snapchat ghost',
      category: 'Social Media',
      path:
        'M12.017.5c-2.134 0-3.939.9-5.116 2.484-1.062 1.428-1.37 3.158-1.37 4.812 0 .88.071 1.692.071 1.692-.058.07-.223.114-.473.114-.428 0-1.002-.15-1.46-.342a.82.82 0 00-.334-.071.565.565 0 00-.558.557c0 .242.145.542.658.752.803.327 1.828.458 2.135.655.28.18.326.54.234.9-.19.75-.758 2.287-2.825 3.275-.186.088-.34.274-.34.568 0 .472.451.728.932.832.554.12 1.17.136 1.4.372.204.208.127.645.027 1.082-.15.656-.028.914.57.914.273 0 .62-.06 1.036-.17.808-.214 1.52-.564 2.943-.564 1.184 0 2.045.558 3.196 1.116.808.392 1.59.692 2.658.692 1.07 0 1.85-.3 2.66-.692 1.15-.558 2.012-1.116 3.195-1.116 1.424 0 2.136.35 2.943.564.417.11.763.17 1.037.17.598 0 .72-.258.57-.914-.1-.437-.177-.874.027-1.082.23-.236.846-.252 1.4-.372.48-.104.932-.36.932-.832 0-.294-.154-.48-.34-.568-2.067-.988-2.635-2.525-2.825-3.275-.092-.36-.046-.72.234-.9.307-.197 1.332-.328 2.135-.655.513-.21.658-.51.658-.752a.565.565 0 00-.558-.557.82.82 0 00-.334.071c-.458.192-1.032.342-1.46.342-.25 0-.415-.044-.473-.114 0 0 .071-.812.071-1.692 0-1.654-.308-3.384-1.37-4.812C15.956 1.4 14.15.5 12.017.5z',
    },
    {
      id: 'reddit',
      label: 'Reddit',
      keywords: 'reddit alien snoo',
      category: 'Social Media',
      path:
        'M12 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 01-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 01.042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 014.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 01.14-.197.35.35 0 01.238-.042l2.906.617a1.214 1.214 0 011.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 00-.231.094.33.33 0 000 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 000-.463.327.327 0 00-.232-.094c-.058 0-.144.023-.232.094-.632.632-1.8.856-2.497.856-.698 0-1.879-.238-2.498-.856a.326.326 0 00-.232-.094z',
    },
    {
      id: 'github',
      label: 'GitHub',
      keywords: 'github code git octocat',
      category: 'Social Media',
      path:
        'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
    },
    {
      id: 'dribbble',
      label: 'Dribbble',
      keywords: 'dribbble design basketball',
      category: 'Social Media',
      path:
        'M12 24C5.385 24 0 18.615 0 12S5.385 0 12 0s12 5.385 12 12-5.385 12-12 12zm10.12-10.358c-.35-.11-3.17-.953-6.384-.438 1.34 3.684 1.887 6.684 1.992 7.308 2.3-1.555 3.936-4.02 4.395-6.87zm-6.115 7.808c-.153-.9-.75-4.032-2.19-7.77l-.066.02c-5.79 2.015-7.86 6.025-8.04 6.4 1.73 1.358 3.92 2.166 6.29 2.166 1.42 0 2.77-.29 4-.814zm-11.62-2.58c.232-.4 3.045-5.055 8.332-6.765.135-.045.27-.084.405-.12-.26-.585-.54-1.167-.832-1.74C7.17 11.775 2.206 11.71 1.756 11.7l-.004.312c0 2.633.998 5.037 2.634 6.855zm-2.42-8.955c.46.008 4.683.026 9.477-1.248-1.698-3.018-3.53-5.558-3.8-5.928-2.868 1.35-5.01 3.99-5.676 7.17zM9.6 2.052c.282.38 2.145 2.914 3.822 6 3.645-1.365 5.19-3.44 5.373-3.702A10.16 10.16 0 0012 1.818c-.824 0-1.63.08-2.4.234zm10.335 3.483c-.218.29-1.91 2.493-5.724 4.04.24.49.47.985.68 1.486.08.18.15.36.22.53 3.41-.43 6.8.26 7.14.33-.02-2.42-.88-4.64-2.31-6.38z',
    },
    {
      id: 'behance',
      label: 'Behance',
      keywords: 'behance portfolio adobe',
      category: 'Social Media',
      path:
        'M22 7h-7v-2h7v2zm1.726 10c-.442 1.297-2.029 3-5.101 3-3.074 0-5.564-1.729-5.564-5.675 0-3.91 2.325-5.92 5.466-5.92 2.93 0 4.96 1.637 5.36 4.619.066.497.099.997.085 1.976h-8.027c.115 2.212 1.39 3.07 2.93 3.07 1.164 0 2.134-.592 2.482-1.512l2.37 1.442zM12 21.54H0V2.46h11.4c3.242 0 5.25 1.377 5.25 4.108 0 1.788-.941 3.135-2.676 3.72v.06c2.063.456 3.277 2.085 3.277 4.07 0 3.1-2.546 5.132-5.254 5.132zM5.002 11.064h5.326c1.452 0 2.49-.718 2.49-2.106 0-1.524-1.092-2.12-2.556-2.12H5.002v4.226zm0 6.94h5.652c1.72 0 2.852-.889 2.852-2.434 0-1.652-1.35-2.34-2.988-2.34H5.002v4.775zm17.28-7.604c-.208-1.422-1.18-2.4-2.588-2.4-1.454 0-2.385.9-2.607 2.4h5.196z',
    },
    {
      id: 'discord',
      label: 'Discord',
      keywords: 'discord chat gaming',
      category: 'Social Media',
      path:
        'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z',
    },
    {
      id: 'spotify',
      label: 'Spotify',
      keywords: 'spotify music streaming',
      category: 'Social Media',
      path:
        'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
    },
    {
      id: 'apple',
      label: 'Apple',
      keywords: 'apple ios mac',
      category: 'Social Media',
      path:
        'M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.81-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z',
    },
    {
      id: 'google',
      label: 'Google',
      keywords: 'google search g',
      category: 'Social Media',
      path:
        'M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z',
    },
    {
      id: 'threads',
      label: 'Threads',
      keywords: 'threads meta instagram text',
      category: 'Social Media',
      path:
        'M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm3 14.5c-1.5.9-3.5.5-4.5-.8l-.5-.8c-1-1.5-.5-3.5 1-4.5s3.5-.5 4.5 1l.5.8c1 1.5.5 3.5-1 4.3z',
    },
    {
      id: 'twitch',
      label: 'Twitch',
      keywords: 'twitch stream gaming live',
      category: 'Social Media',
      path:
        'M3.5 2L2 5.5V20h5v3h3l3-3h4l5-5V2H3.5zM20 13l-3 3h-4l-3 3v-3H6V4h14v9z',
    },
    {
      id: 'vimeo',
      label: 'Vimeo',
      keywords: 'vimeo video film',
      category: 'Social Media',
      path:
        'M22 7.42c-.1 2.1-1.56 4.98-4.38 8.64C14.68 19.9 12.16 21.5 10 21.5c-1.34 0-2.47-1.24-3.4-3.72L4.7 11.6C4.1 9.12 3.46 7.88 2.76 7.88c-.16 0-.74.35-1.72 1.04L0 7.56l3.24-2.88c1.46-1.26 2.56-1.9 3.3-1.94 1.74-.08 2.8 1.02 3.2 3.3.42 2.46.72 4 .88 4.58.5 2.24 1.04 3.36 1.64 3.36.46 0 1.16-.73 2.1-2.2.92-1.46 1.42-2.58 1.5-3.34.12-1.26-.36-1.9-1.48-1.9-.52 0-1.06.12-1.62.36C13.86 3.98 16.46 2.12 19.72 2c2.42-.08 3.56 1.64 3.28 5.42z',
    },
    {
      id: 'medium',
      label: 'Medium',
      keywords: 'medium blog writing article',
      category: 'Social Media',
      path:
        'M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zm7.42 0c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42zM24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z',
    },
    {
      id: 'slack',
      label: 'Slack',
      keywords: 'slack work team messaging',
      category: 'Social Media',
      path:
        'M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.268 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.831 24a2.528 2.528 0 0 1-2.52-2.522v-6.313z',
    },
    {
      id: 'zoom',
      label: 'Zoom',
      keywords: 'zoom meeting video call',
      category: 'Social Media',
      path:
        'M16 3.5H2.5A1.5 1.5 0 001 5v9.5A1.5 1.5 0 002.5 16h13.53a1.5 1.5 0 001.47-1.2V5.2A1.5 1.5 0 0016 3.5zM20.5 7l2.5 2v6l-2.5 2',
    },

    /* ── Business ───────────────────────────────────────────── */
    {
      id: 'briefcase',
      label: 'Briefcase',
      keywords: 'briefcase work job bag',
      category: 'Business',
      path:
        'M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2',
    },
    {
      id: 'chart-bar',
      label: 'Bar Chart',
      keywords: 'chart bar graph analytics stats',
      category: 'Business',
      path: 'M18 20V10M12 20V4M6 20v-6',
    },
    {
      id: 'building',
      label: 'Building',
      keywords: 'building office company city',
      category: 'Business',
      path:
        'M6 22V4a2 2 0 012-2h8a2 2 0 012 2v18M2 22h20M10 6h.01M14 6h.01M10 10h.01M14 10h.01M10 14h.01M14 14h.01M10 18h4',
    },
    {
      id: 'presentation',
      label: 'Presentation',
      keywords: 'presentation slides meeting pitch',
      category: 'Business',
      path:
        'M2 3h20M12 3v18M8 21l4-4 4 4M4 3v10a2 2 0 002 2h12a2 2 0 002-2V3',
    },
    {
      id: 'dollar',
      label: 'Dollar',
      keywords: 'dollar money currency finance',
      category: 'Business',
      path:
        'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
    },
    {
      id: 'target',
      label: 'Target',
      keywords: 'target goal aim bullseye',
      category: 'Business',
      path:
        'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z',
    },
    {
      id: 'trophy',
      label: 'Trophy',
      keywords: 'trophy award prize winner cup',
      category: 'Business',
      path:
        'M6 9H4a2 2 0 01-2-2V5a2 2 0 012-2h2M18 9h2a2 2 0 002-2V5a2 2 0 00-2-2h-2M6 3h12v6a6 6 0 01-12 0V3zM9 21h6M12 15v6',
    },
    {
      id: 'pie-chart',
      label: 'Pie Chart',
      keywords: 'pie chart analytics data statistics',
      category: 'Business',
      path:
        'M21.21 15.89A10 10 0 118 2.83M22 12A10 10 0 0012 2v10z',
    },
    {
      id: 'trending',
      label: 'Trending Up',
      keywords: 'trending growth line graph upward',
      category: 'Business',
      path: 'M23 6l-9.5 9.5-5-5L1 18',
    },
    {
      id: 'wallet',
      label: 'Wallet',
      keywords: 'wallet payment money purse',
      category: 'Business',
      path:
        'M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2zM2 11h20M16 15.01h.01',
    },

    /* ── Communication ──────────────────────────────────────── */
    {
      id: 'phone-icon',
      label: 'Phone',
      keywords: 'phone call telephone mobile',
      category: 'Communication',
      path:
        'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.574 2.81.7A2 2 0 0122 16.92z',
    },
    {
      id: 'email-icon',
      label: 'Email',
      keywords: 'email mail envelope message',
      category: 'Communication',
      path:
        'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
    },
    {
      id: 'chat-bubble',
      label: 'Chat',
      keywords: 'chat bubble message conversation',
      category: 'Communication',
      path:
        'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    },
    {
      id: 'video-cam',
      label: 'Video Camera',
      keywords: 'video camera record film',
      category: 'Communication',
      path:
        'M23 7l-7 5 7 5zM16 5H3a2 2 0 00-2 2v10a2 2 0 002 2h13a2 2 0 002-2V7a2 2 0 00-2-2z',
    },
    {
      id: 'microphone-icon',
      label: 'Microphone',
      keywords: 'microphone mic audio voice record',
      category: 'Communication',
      path:
        'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8',
    },
    {
      id: 'megaphone',
      label: 'Megaphone',
      keywords: 'megaphone announce speaker promotion',
      category: 'Communication',
      path:
        'M3 11l18-5v12L3 13v-2zM11.6 16.8a3 3 0 11-5.8-1.6',
    },
    {
      id: 'bell-icon',
      label: 'Bell',
      keywords: 'bell notification alert ring',
      category: 'Communication',
      path:
        'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
    },
    {
      id: 'send-icon',
      label: 'Send',
      keywords: 'send paper plane message',
      category: 'Communication',
      path: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
    },

    /* ── Symbols ────────────────────────────────────────────── */
    {
      id: 'arrow-right-icon',
      label: 'Arrow Right',
      keywords: 'arrow right forward next',
      category: 'Symbols',
      path: 'M5 12h14M12 5l7 7-7 7',
    },
    {
      id: 'arrow-left-icon',
      label: 'Arrow Left',
      keywords: 'arrow left back previous',
      category: 'Symbols',
      path: 'M19 12H5M12 19l-7-7 7-7',
    },
    {
      id: 'arrow-up-icon',
      label: 'Arrow Up',
      keywords: 'arrow up top above',
      category: 'Symbols',
      path: 'M12 19V5M5 12l7-7 7 7',
    },
    {
      id: 'arrow-down-icon',
      label: 'Arrow Down',
      keywords: 'arrow down bottom below',
      category: 'Symbols',
      path: 'M12 5v14M19 12l-7 7-7-7',
    },
    {
      id: 'check-circle-icon',
      label: 'Check Circle',
      keywords: 'check circle done success yes',
      category: 'Symbols',
      path: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
    },
    {
      id: 'x-circle-icon',
      label: 'X Circle',
      keywords: 'x circle close cancel error',
      category: 'Symbols',
      path:
        'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM15 9l-6 6M9 9l6 6',
    },
    {
      id: 'plus-circle-icon',
      label: 'Plus Circle',
      keywords: 'plus circle add new create',
      category: 'Symbols',
      path:
        'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 8v8M8 12h8',
    },
    {
      id: 'minus-circle-icon',
      label: 'Minus Circle',
      keywords: 'minus circle remove subtract',
      category: 'Symbols',
      path:
        'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM8 12h8',
    },
    {
      id: 'info-icon',
      label: 'Info',
      keywords: 'info information help about',
      category: 'Symbols',
      path:
        'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01',
    },
    {
      id: 'warning-icon',
      label: 'Warning',
      keywords: 'warning alert caution triangle danger',
      category: 'Symbols',
      path:
        'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
    },
    {
      id: 'star-filled-icon',
      label: 'Star',
      keywords: 'star favorite rating review',
      category: 'Symbols',
      path:
        'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    },
    {
      id: 'heart-fill-icon',
      label: 'Heart',
      keywords: 'heart love like favorite',
      category: 'Symbols',
      path:
        'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
    },
    {
      id: 'flag-icon',
      label: 'Flag',
      keywords: 'flag report mark banner',
      category: 'Symbols',
      path:
        'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
    },
    {
      id: 'bookmark-icon',
      label: 'Bookmark',
      keywords: 'bookmark save read later',
      category: 'Symbols',
      path: 'M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z',
    },
    {
      id: 'pin-icon',
      label: 'Pin',
      keywords: 'pin location map marker',
      category: 'Symbols',
      path:
        'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 13a3 3 0 100-6 3 3 0 000 6z',
    },
    {
      id: 'tag-icon',
      label: 'Tag',
      keywords: 'tag label price category',
      category: 'Symbols',
      path:
        'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
    },

    /* ── Technology ──────────────────────────────────────────── */
    {
      id: 'code-icon',
      label: 'Code',
      keywords: 'code brackets developer programming',
      category: 'Technology',
      path: 'M16 18l6-6-6-6M8 6l-6 6 6 6',
    },
    {
      id: 'database-icon',
      label: 'Database',
      keywords: 'database storage data sql',
      category: 'Technology',
      path:
        'M12 2C6.48 2 2 3.79 2 6v12c0 2.21 4.48 4 10 4s10-1.79 10-4V6c0-2.21-4.48-4-10-4zM2 6c0 2.21 4.48 4 10 4s10-1.79 10-4M2 12c0 2.21 4.48 4 10 4s10-1.79 10-4',
    },
    {
      id: 'cloud-icon',
      label: 'Cloud',
      keywords: 'cloud storage upload hosting',
      category: 'Technology',
      path:
        'M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z',
    },
    {
      id: 'server-icon',
      label: 'Server',
      keywords: 'server hosting rack infrastructure',
      category: 'Technology',
      path:
        'M2 5a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2V5zM2 15a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4zM6 7h.01M6 17h.01',
    },
    {
      id: 'wifi-icon',
      label: 'WiFi',
      keywords: 'wifi wireless signal internet',
      category: 'Technology',
      path:
        'M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01',
    },
    {
      id: 'terminal-icon',
      label: 'Terminal',
      keywords: 'terminal console command prompt cli',
      category: 'Technology',
      path: 'M4 17l6-6-6-6M12 19h8',
    },
    {
      id: 'globe-icon',
      label: 'Globe',
      keywords: 'globe world earth web international',
      category: 'Technology',
      path:
        'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z',
    },
    {
      id: 'link-icon',
      label: 'Link',
      keywords: 'link chain url hyperlink',
      category: 'Technology',
      path:
        'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
    },
    {
      id: 'shield-icon',
      label: 'Shield',
      keywords: 'shield security protect safety',
      category: 'Technology',
      path:
        'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
    },
    {
      id: 'key-icon',
      label: 'Key',
      keywords: 'key access password auth',
      category: 'Technology',
      path:
        'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
    },
    {
      id: 'lock-icon',
      label: 'Lock',
      keywords: 'lock secure padlock private',
      category: 'Technology',
      path:
        'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
    },
    {
      id: 'monitor-icon',
      label: 'Monitor',
      keywords: 'monitor screen display desktop',
      category: 'Technology',
      path:
        'M2 5a2 2 0 012-2h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zM8 21h8M12 17v4',
    },
    {
      id: 'smartphone-icon',
      label: 'Smartphone',
      keywords: 'smartphone phone mobile device',
      category: 'Technology',
      path:
        'M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2zM12 18h.01',
    },

    /* ── General ─────────────────────────────────────────────── */
    {
      id: 'home-icon',
      label: 'Home',
      keywords: 'home house main landing',
      category: 'General',
      path:
        'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10',
    },
    {
      id: 'search-icon',
      label: 'Search',
      keywords: 'search find magnify lookup',
      category: 'General',
      path:
        'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
    },
    {
      id: 'user-icon',
      label: 'User',
      keywords: 'user person profile account',
      category: 'General',
      path:
        'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
    },
    {
      id: 'users-icon',
      label: 'Users',
      keywords: 'users people group team',
      category: 'General',
      path:
        'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
    },
    {
      id: 'calendar-icon',
      label: 'Calendar',
      keywords: 'calendar date schedule event',
      category: 'General',
      path:
        'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
    },
    {
      id: 'clock-icon',
      label: 'Clock',
      keywords: 'clock time watch hour',
      category: 'General',
      path:
        'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
    },
    {
      id: 'map-pin-icon',
      label: 'Map Pin',
      keywords: 'map pin location place gps',
      category: 'General',
      path:
        'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 13a3 3 0 100-6 3 3 0 000 6z',
    },
    {
      id: 'camera-icon',
      label: 'Camera',
      keywords: 'camera photo snapshot lens',
      category: 'General',
      path:
        'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z',
    },
    {
      id: 'folder-icon',
      label: 'Folder',
      keywords: 'folder directory files organize',
      category: 'General',
      path:
        'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
    },
    {
      id: 'file-icon',
      label: 'File',
      keywords: 'file document page paper',
      category: 'General',
      path: 'M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7',
    },
    {
      id: 'download-icon2',
      label: 'Download',
      keywords: 'download save get export',
      category: 'General',
      path:
        'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
    },
    {
      id: 'edit-icon',
      label: 'Edit',
      keywords: 'edit pencil write modify',
      category: 'General',
      path:
        'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
    },
    {
      id: 'trash-icon',
      label: 'Trash',
      keywords: 'trash delete remove bin garbage',
      category: 'General',
      path:
        'M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6',
    },
    {
      id: 'eye-general',
      label: 'Eye',
      keywords: 'eye view visible show watch',
      category: 'General',
      path:
        'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z',
    },
    {
      id: 'filter-icon',
      label: 'Filter',
      keywords: 'filter funnel sort refine',
      category: 'General',
      path: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
    },
    {
      id: 'sort-icon',
      label: 'Sort',
      keywords: 'sort order list arrange',
      category: 'General',
      path: 'M3 6h18M6 12h12M9 18h6',
    },
  ];

  var ICON_CATEGORIES = (function () {
    var cats = ['All'];
    SOCIAL_ICONS.forEach(function (icon) {
      if (icon.category && cats.indexOf(icon.category) === -1) {
        cats.push(icon.category);
      }
    });
    return cats;
  })();

  var VB = 24;
  var modalEventsWired = false;
  var activeCategory = 'All';

  function injectModalStyles() {
    if (document.getElementById('social-icons-modal-styles')) return;
    var style = document.createElement('style');
    style.id = 'social-icons-modal-styles';
    style.textContent =
      '#social-icons-modal{position:fixed;inset:0;z-index:850;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);padding:16px;}' +
      '#social-icons-modal.show{display:flex;}' +
      '#social-icons-modal .social-icons-dialog{background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.72);width:min(520px,96vw);max-height:min(88vh,720px);display:flex;flex-direction:column;overflow:hidden;font-family:DM Sans,sans-serif;}' +
      '#social-icons-modal .sim-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 10px;border-bottom:1px solid var(--border);}' +
      '#social-icons-modal .sim-title{margin:0;font-size:15px;font-weight:600;color:var(--text);}' +
      '#social-icons-modal .sim-close{width:36px;height:36px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text-dim);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,border-color .15s,color .15s;}' +
      '#social-icons-modal .sim-close:hover{border-color:var(--gold);color:var(--gold);background:var(--gold-dim);}' +
      '#social-icons-modal .sim-body{padding:14px 16px 16px;overflow:auto;flex:1;}' +
      '#social-icons-modal .sim-search{width:100%;box-sizing:border-box;padding:9px 12px;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:13px;margin-bottom:10px;outline:none;}' +
      '#social-icons-modal .sim-search:focus{border-color:var(--gold);}' +
      '#social-icons-modal .sim-cat-bar{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}' +
      '#social-icons-modal .sim-cat-btn{padding:5px 12px;border-radius:20px;border:1px solid var(--border);background:var(--surface2);color:var(--text-dim);font-size:12px;font-weight:500;cursor:pointer;transition:all .15s;white-space:nowrap;font-family:DM Sans,sans-serif;}' +
      '#social-icons-modal .sim-cat-btn:hover{border-color:var(--gold);color:var(--text);}' +
      '#social-icons-modal .sim-cat-btn.active{background:var(--gold);color:#1a1a2e;border-color:var(--gold);font-weight:600;}' +
      '#social-icons-modal .sim-controls{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;margin-bottom:14px;}' +
      '#social-icons-modal .sim-ctrl{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-dim);}' +
      '#social-icons-modal .sim-ctrl input[type=color]{width:36px;height:32px;padding:0;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:var(--surface2);}' +
      '#social-icons-modal .sim-ctrl input[type=range]{width:120px;accent-color:var(--gold);}' +
      '#social-icons-modal .sim-size-val{min-width:28px;color:var(--text);font-variant-numeric:tabular-nums;}' +
      '#social-icons-modal .social-icons-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;}' +
      '#social-icons-modal .sim-icon-btn{width:44px;height:44px;padding:0;border-radius:8px;border:1px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .12s,border-color .15s,background .15s,box-shadow .15s;}' +
      '#social-icons-modal .sim-icon-btn:hover{border-color:var(--gold);background:var(--gold-dim);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.25);}' +
      '#social-icons-modal .sim-icon-btn svg{display:block;}' +
      '#social-icons-modal .sim-empty{grid-column:1/-1;text-align:center;padding:24px 8px;color:var(--text-dim);font-size:13px;}' +
      '#social-icons-modal .sim-count{font-size:12px;color:var(--text-dim);margin-bottom:8px;}';
    document.head.appendChild(style);
  }

  function buildModalDOM() {
    if (document.getElementById('social-icons-modal')) return;

    var root = document.createElement('div');
    root.id = 'social-icons-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'social-icons-modal-title');
    root.innerHTML =
      '<div class="social-icons-dialog">' +
      '<div class="sim-head">' +
      '<h2 class="sim-title" id="social-icons-modal-title">Icon Library</h2>' +
      '<button type="button" class="sim-close" id="social-icons-modal-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="sim-body">' +
      '<input type="search" class="sim-search" id="social-icons-search" placeholder="Search ' + SOCIAL_ICONS.length + ' icons\u2026" autocomplete="off">' +
      '<div class="sim-cat-bar" id="social-icons-cat-bar"></div>' +
      '<div class="sim-controls">' +
      '<label class="sim-ctrl"><span>Color</span><input type="color" id="social-icons-color" value="#ffffff"></label>' +
      '<label class="sim-ctrl"><span>Size</span><input type="range" id="social-icons-size" min="20" max="80" value="40" step="1"><span class="sim-size-val" id="social-icons-size-val">40</span>px</label>' +
      '</div>' +
      '<div class="sim-count" id="social-icons-count"></div>' +
      '<div class="social-icons-grid" id="social-icons-grid"></div>' +
      '</div></div>';

    document.body.appendChild(root);

    renderCategoryTabs();
  }

  function renderCategoryTabs() {
    var bar = document.getElementById('social-icons-cat-bar');
    if (!bar) return;
    bar.innerHTML = '';
    ICON_CATEGORIES.forEach(function (cat) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sim-cat-btn' + (cat === activeCategory ? ' active' : '');
      btn.textContent = cat;
      btn.setAttribute('data-category', cat);
      btn.addEventListener('click', function () {
        activeCategory = cat;
        var all = bar.querySelectorAll('.sim-cat-btn');
        for (var i = 0; i < all.length; i++) {
          all[i].classList.remove('active');
        }
        btn.classList.add('active');
        var search = document.getElementById('social-icons-search');
        filterSocialIconGrid(search ? search.value : '');
      });
      bar.appendChild(btn);
    });
  }

  function getInsertColor() {
    var el = document.getElementById('social-icons-color');
    return el ? el.value : '#ffffff';
  }

  function getInsertSize() {
    var el = document.getElementById('social-icons-size');
    var n = el ? parseInt(el.value, 10) : 40;
    if (isNaN(n)) return 40;
    return Math.min(80, Math.max(20, n));
  }

  function openSocialIconsModal() {
    var modal = document.getElementById('social-icons-modal');
    if (modal) modal.classList.add('show');
    activeCategory = 'All';
    renderCategoryTabs();
    var search = document.getElementById('social-icons-search');
    if (search) {
      search.value = '';
      search.focus();
      filterSocialIconGrid('');
    }
  }

  function closeSocialIconsModal() {
    var modal = document.getElementById('social-icons-modal');
    if (modal) modal.classList.remove('show');
  }

  function iconPathList(entry) {
    if (entry.paths && entry.paths.length) return entry.paths;
    if (entry.path) return [entry.path];
    return [];
  }

  function makeFabricIcon(entry, color, sizePx) {
    var ds = iconPathList(entry);
    if (!ds.length || typeof fabric === 'undefined') return null;

    if (ds.length === 1) {
      var p = new fabric.Path(ds[0], {
        fill: color,
        stroke: '',
        strokeWidth: 0,
      });
      p.scaleToWidth(sizePx);
      return p;
    }

    var parts = ds.map(function (d) {
      return new fabric.Path(d, { fill: color, stroke: '', strokeWidth: 0 });
    });
    var grp = new fabric.Group(parts, { subTargetCheck: false });
    grp.scaleToWidth(sizePx);
    return grp;
  }

  function addSocialIconToCanvas(entry) {
    var cvs = typeof getActiveCanvas === 'function' ? getActiveCanvas() : typeof canvas !== 'undefined' ? canvas : null;
    if (!cvs || typeof fabric === 'undefined') return;

    var color = getInsertColor();
    var size = getInsertSize();
    var cx = cvs.getWidth() / 2;
    var cy = cvs.getHeight() / 2;

    var obj = makeFabricIcon(entry, color, size);
    if (!obj) return;

    obj.set({
      left: cx,
      top: cy,
      originX: 'center',
      originY: 'center',
      selectable: true,
      evented: true,
      hasControls: true,
      lockScalingFlip: true,
    });
    obj._iconName = entry.label;

    cvs.add(obj);
    cvs.setActiveObject(obj);
    cvs.renderAll();
    closeSocialIconsModal();
  }

  function filterSocialIconGrid(q) {
    q = (q || '').toLowerCase().trim();
    var grid = document.getElementById('social-icons-grid');
    var countEl = document.getElementById('social-icons-count');
    if (!grid) return;

    grid.innerHTML = '';

    var list = SOCIAL_ICONS.filter(function (e) {
      if (activeCategory !== 'All' && e.category !== activeCategory) return false;
      if (!q) return true;
      return (
        e.label.toLowerCase().indexOf(q) !== -1 ||
        e.id.indexOf(q) !== -1 ||
        (e.keywords && e.keywords.indexOf(q) !== -1)
      );
    });

    if (countEl) {
      countEl.textContent = list.length + ' of ' + SOCIAL_ICONS.length + ' icons';
    }

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'sim-empty';
      empty.textContent = 'No icons match your search.';
      grid.appendChild(empty);
      return;
    }

    list.forEach(function (entry) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sim-icon-btn';
      btn.title = entry.label;
      btn.setAttribute('aria-label', 'Insert ' + entry.label);

      var ds = iconPathList(entry);
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + VB + ' ' + VB);
      svg.setAttribute('width', '22');
      svg.setAttribute('height', '22');
      ds.forEach(function (d) {
        var pe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pe.setAttribute('d', d);
        pe.setAttribute('fill', 'currentColor');
        svg.appendChild(pe);
      });
      btn.appendChild(svg);

      btn.addEventListener('click', function () {
        addSocialIconToCanvas(entry);
      });
      grid.appendChild(btn);
    });
  }

  function wireModalEvents() {
    if (modalEventsWired) return;
    modalEventsWired = true;

    var modal = document.getElementById('social-icons-modal');
    var dialog = modal ? modal.querySelector('.social-icons-dialog') : null;
    var closeBtn = document.getElementById('social-icons-modal-close');
    var search = document.getElementById('social-icons-search');
    var size = document.getElementById('social-icons-size');
    var sizeVal = document.getElementById('social-icons-size-val');

    if (dialog) {
      dialog.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
    if (modal) {
      modal.addEventListener('click', function () {
        closeSocialIconsModal();
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeSocialIconsModal();
      });
    }
    if (search) {
      search.addEventListener('input', function () {
        filterSocialIconGrid(search.value);
      });
    }
    if (size && sizeVal) {
      var syncSize = function () {
        sizeVal.textContent = String(getInsertSize());
      };
      size.addEventListener('input', syncSize);
      syncSize();
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal && modal.classList.contains('show')) {
        closeSocialIconsModal();
      }
    });
  }

  function rebindToolIcon() {
    var toolIcon = document.getElementById('tool-icon');
    if (!toolIcon || !toolIcon.parentNode) return;
    var fresh = toolIcon.cloneNode(true);
    toolIcon.parentNode.replaceChild(fresh, toolIcon);
    fresh.addEventListener('click', function (e) {
      e.preventDefault();
      openSocialIconsModal();
    });
  }

  function initSocialIconLibrary(options) {
    options = options || {};
    injectModalStyles();
    buildModalDOM();
    filterSocialIconGrid('');
    wireModalEvents();
    if (options.deferToolBind) {
      setTimeout(rebindToolIcon, 250);
    } else {
      rebindToolIcon();
    }
  }

  function boot() {
    initSocialIconLibrary({ deferToolBind: true });
  }

  // Faz 8: shared module loads after DOMContentLoaded → self-init on sticky cc:canvas-ready.
  if (window.cc && cc.on) cc.on('cc:canvas-ready', function () { cc.safe('shared.social-icons', boot); });
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.initSocialIconLibrary = initSocialIconLibrary;
  window.openSocialIconsModal = openSocialIconsModal;
  window.closeSocialIconsModal = closeSocialIconsModal;
})();

// Modular skeleton hook (Faz 8) — social-icons is now a shared loader module (modules/shared/).
if (window.cc && cc.modules) cc.modules.register({ id: 'social-icons', parent: 'shared', title: 'Social icons', mount: function () {}, unmount: function () {} });
