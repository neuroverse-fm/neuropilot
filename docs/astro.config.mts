// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const BASE_GITHUB_URL = 'https://github.com/VSC-NeuroPilot/neuropilot'

// https://astro.build/config
export default defineConfig({
    site: 'https://vsc-neuropilot.github.io/neuropilot',
    base: '/neuropilot',
    integrations: [
        starlight({
            favicon: '/heart-pink.svg',
            customCss: [
                './src/styles/icons.css'
            ],
            head: [
                {
                    tag: 'link',
                    attrs: {
                        rel: 'icon',
                        href: '/neuropilot/heart-pink.svg'
                    }
                }
            ],
            title: 'NeuroPilot Docs',
            editLink: {
                baseUrl: BASE_GITHUB_URL + '/edit/master/docs'
            },
            lastUpdated: true,
            logo: {
                dark: './src/assets/evilpilot.svg',
                light: './src/assets/neuropilot.svg',
                alt: 'NeuroPilot and EvilPilot icons'
            },
            social: [
                {
                    icon: 'vscode',
                    label: 'NeuroPilot listing on Visual Studio Marketplace',
                    href: 'https://marketplace.visualstudio.com/items?itemName=Pasu4.neuropilot',
                },
                {
                    icon: 'github',
                    label: 'NeuroPilot GitHub',
                    href: BASE_GITHUB_URL,
                },
            ],
            sidebar: [
                {
                    label: 'Guides',
                    items: [
                        {
                            label: 'Setup NeuroPilot',
                            slug: 'guides/setup',
                        },
                        {
                            label: 'Pilot modes',
                            slug: 'guides/pilot',
                        },
                        {
                            label: 'Sandboxing',
                            slug: 'guides/sandboxing'
                        }
                    ],
                },
                {
                    label: 'Reference',
                    items: [
                        {
                            label: 'Features',
                            autogenerate: {
                                directory: 'reference/features',
                                collapsed: true
                            }
                        },
                        { label: 'Safety', slug: 'reference/safety' },
                        { label: 'Commands', slug: 'reference/commands' },
                        { label: 'Context', slug: 'reference/auto-context' },
                        { label: 'Cookies', slug: 'reference/cookies' },
                        { label: 'Cursor', slug: 'reference/cursor' },
                        { label: 'Permissions', slug: 'reference/permissions', badge: { text: 'Important', variant: 'tip' } },
                        { label: 'RCE', slug: 'reference/rce', badge: { text: 'Core', variant: 'note' } },
                        { label: 'Settings', slug: 'reference/settings' },
                        { label: 'Dependencies', slug: 'reference/dependencies' },
                    ],
                },
                "assets",
                {
                    label: 'Contributors',
                    autogenerate: {
                        directory: 'contributors',
                        collapsed: true
                    }
                }
            ],
            components: {
                Footer: './src/components/Footer.astro'
            }
        }),
    ],
});
