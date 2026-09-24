const GhostAdminAPI = require('@tryghost/admin-api');

// ⚠️ Get secrets from environment variables (safe and secure)
const ADMIN_API_URL = process.env.GHOST_ADMIN_URL;
const ADMIN_API_KEY = process.env.GHOST_ADMIN_KEY;

const api = new GhostAdminAPI({
    url: ADMIN_API_URL,
    key: ADMIN_API_KEY,
    version: 'v5.0'
});

// Fisher-Yates shuffle (sort with Math.random() is biased)
function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// Skip sending if a newsletter already went out recently, so a cron retry
// after a timeout doesn't email everyone twice
const MIN_DAYS_BETWEEN_SENDS = 3;

async function findRecentNewsletter() {
    const since = new Date(Date.now() - MIN_DAYS_BETWEEN_SENDS * 24 * 60 * 60 * 1000).toISOString();
    const recent = await api.posts.browse({
        filter: `tag:newsletter+status:[published,sent]+created_at:>'${since}'`,
        limit: 1,
        fields: 'id,title,created_at'
    });
    return recent && recent.length > 0 ? recent[0] : null;
}

const GRID_SIZE = 4;
const HERO_TITLE_LENGTH = 60;
const GRID_TITLE_LENGTH = 40;

// URLs of posts featured in earlier newsletters, so we can show readers
// images they haven't been sent yet
async function getPreviouslyFeaturedText() {
    const pastNewsletters = await api.posts.browse({
        filter: 'tag:newsletter+status:[published,sent]',
        limit: 'all',
        fields: 'lexical,feature_image_caption'
    });
    return (pastNewsletters || [])
        .map(post => `${post.lexical || ''} ${post.feature_image_caption || ''}`)
        .join(' ');
}

// Picks 1 hero + up to 6 grid images, preferring posts never featured before.
// Once everything has been featured, the rest are filled from older picks.
async function pickPosts() {
    const posts = await api.posts.browse({
        filter: 'status:published+feature_image:-null',
        limit: 'all',
        fields: 'feature_image,url,title'
    });
    
    if (!posts || posts.length === 0) {
        throw new Error('No posts with feature images found');
    }
    console.log(`Found ${posts.length} posts with images`);
    
    const featuredText = await getPreviouslyFeaturedText();
    const unseen = posts.filter(post => !featuredText.includes(post.url));
    const seen = posts.filter(post => featuredText.includes(post.url));
    console.log(`${unseen.length} posts not featured in a newsletter yet`);
    
    const selected = [...shuffle(unseen), ...shuffle(seen)].slice(0, GRID_SIZE + 1);
    return { hero: selected[0], grid: selected.slice(1) };
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Shorten long titles at a word boundary
function truncate(text, maxLength) {
    const clean = String(text).trim();
    if (clean.length <= maxLength) return clean;
    const cut = clean.slice(0, maxLength - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

// Email-safe button with inline styles, so it looks like a button in every inbox
function emailButton(text, url, color, outline = false) {
    const cellStyle = outline
        ? `border:2px solid ${color};border-radius:5px;`
        : `background:${color};border:2px solid ${color};border-radius:5px;`;
    const linkStyle = `display:inline-block;padding:10px 18px;font-size:15px;font-weight:600;text-decoration:none;color:${outline ? color : '#ffffff'};`;
    return `<td style="${cellStyle}"><a href="${escapeHtml(url)}" style="${linkStyle}">${escapeHtml(text)}</a></td>`;
}

// Cards shown only to one group of members in the email, never on the web
function segmentHtmlCard(html, memberSegment) {
    return {
        type: 'html',
        version: 1,
        html,
        visibility: {
            web: { nonMember: false, memberSegment: '' },
            email: { memberSegment }
        }
    };
}

// Ask Ghost for a smaller copy of its own images so the email stays light
function thumbnailUrl(url) {
    if (url.includes('/content/images/') && !url.includes('/content/images/size/')) {
        return url.replace('/content/images/', '/content/images/size/w600/');
    }
    return url;
}

// Email-safe 2-column grid (tables render in Gmail and Outlook)
function buildGridHtml(posts) {
    const cells = posts.map(post => `
        <td width="50%" valign="top" style="padding:6px;vertical-align:top;">
            <a href="${escapeHtml(post.url)}" style="text-decoration:none;color:inherit;">
                <img src="${escapeHtml(thumbnailUrl(post.feature_image))}" alt="${escapeHtml(post.title)}" width="270" style="display:block;width:100%;height:auto;border:0;">
                <span style="display:block;margin-top:6px;font-size:14px;line-height:1.3;">${escapeHtml(truncate(post.title, GRID_TITLE_LENGTH))}</span>
            </a>
        </td>`);
    
    const rows = [];
    for (let i = 0; i < cells.length; i += 2) {
        const row = cells.slice(i, i + 2);
        if (row.length < 2) row.push('<td width="50%" style="padding:6px;"></td>');
        rows.push(`<tr>${row.join('')}</tr>`);
    }
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows.join('')}</table>`;
}

async function createWeeklyNewsletter({ draftOnly = false } = {}) {
    console.log('Starting createWeeklyNewsletter...');
    
    const recent = draftOnly ? null : await findRecentNewsletter();
    if (recent) {
        console.log(`Newsletter already sent at ${recent.created_at} (ID: ${recent.id}). Skipping.`);
        return { skipped: true, id: recent.id };
    }
    
    // 1. Automatically fetch your active newsletter slug
    console.log('Fetching active newsletter configuration...');
    const newsletters = await api.newsletters.browse({ filter: 'status:active', limit: 1 });
    if (!newsletters || newsletters.length === 0) {
        throw new Error('No active newsletter found in Ghost setup.');
    }
    const newsletterSlug = newsletters[0].slug;
    console.log(`Targeting newsletter: ${newsletterSlug}`);
    
    const site = await api.site.read();
    const siteUrl = site.url.replace(/\/$/, '');
    const accentColor = /^#[0-9a-fA-F]{3,6}$/.test(site.accent_color || '') ? site.accent_color : '#15212A';

    
    // 2. Pick this week's images
    const { hero, grid } = await pickPosts();
    console.log('Hero:', hero.title);
    grid.forEach(post => console.log('Grid:', post.title));
    const heroTitle = truncate(hero.title, HERO_TITLE_LENGTH);
    
    // 3. Build the newsletter content using Lexical format.
    // Almost silent: the images do the talking.
    const children = [
        {
            type: 'button',
            version: 1,
            buttonText: 'View',
            alignment: 'center',
            buttonUrl: hero.url
        }
    ];
    
    if (grid.length > 0) {
        children.push(
            { type: 'horizontalrule' },
            {
                type: 'heading',
                tag: 'h3',
                children: [{ type: 'text', text: 'More from our gallery' }]
            },
            { type: 'html', version: 1, html: buildGridHtml(grid) }
        );
    }
    
    const divider = '<hr style="border:0;border-top:1px solid #e5e5e5;margin:28px 0;">';
    children.push(
        // Shown only to free members
        segmentHtmlCard(
            divider +
            '<p><strong>All our images are free to download</strong></p>' +
            "<p>We gather sacred art from museums around the world, make sure it's in the public domain, and sort it for Catholics so you don't have to search. If it has helped your prayer, your home or your parish, would you help keep it free?</p>" +
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
            emailButton('Give a gift', `${siteUrl}/#/portal/support`, accentColor) +
            '<td width="10"></td>' +
            emailButton('Become a supporter', `${siteUrl}/#/portal/account/plans`, accentColor, true) +
            '</tr></table>',
            'status:free'
        ),
        // Shown only to paid members
        segmentHtmlCard(
            divider +
            '<p><strong>Thank you, and God bless you</strong></p>' +
            '<p>Your generosity keeps this beauty free for everyone who comes looking. You are remembered in our prayers.</p>',
            'status:-free'
        )
    );
    
    const lexicalContent = {
        root: {
            children,
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1
        }
    };
    
    // The title is the subject line: name the hero image so the inbox preview changes each week
    const newsletterTitle = grid.length > 0 ? `${heroTitle} + ${grid.length} more` : heroTitle;
    
    // 4. STEP 1: Create the post as a DRAFT marked as email_only
    const draftData = {
        title: newsletterTitle,
        lexical: JSON.stringify(lexicalContent),
        tags: ['newsletter'],
        feature_image: hero.feature_image,
        feature_image_alt: hero.title,
        feature_image_caption: `<a href="${escapeHtml(hero.url)}">${escapeHtml(heroTitle)}</a>`,
        status: 'draft',
        email_only: true // Email only: never published on the website
    };
    
    console.log('Creating newsletter draft...');
    const draftPost = await api.posts.add(draftData);
    
    // Preview mode: leave the draft in Ghost so you can check it and send yourself a test email
    if (draftOnly) {
        console.log(`Draft only (ID: ${draftPost.id}). Not sending.`);
        return { draftOnly: true, id: draftPost.id, title: draftPost.title };
    }
    
    // 5. STEP 2: Publish the draft with newsletter tracking parameters to broadcast it
    console.log(`Draft created (ID: ${draftPost.id}). Triggering email-only broadcast...`);
    const sentPost = await api.posts.edit(
        {
            id: draftPost.id,
            updated_at: draftPost.updated_at,
            status: 'published' // Flipping to published sends it
        },
        {
            newsletter: newsletterSlug, // Directing to your active newsletter
            email_segment: 'all'        // Sending to all subscribers inside it
        }
    );
    
    console.log(`Successfully broadcasted email newsletter! Ghost status: ${sentPost.status}`);
    return sentPost;
}

// Serverless function handler
module.exports = async (req, res) => {
    try {
        // Add ?draft=1 to the URL to create a draft without emailing anyone
        const draftOnly = Boolean(req.query && req.query.draft);
        const result = await createWeeklyNewsletter({ draftOnly });
        
        if (result.draftOnly) {
            return res.status(200).json({
                success: true,
                message: `Draft created, not sent: ${result.title}`,
                postId: result.id
            });
        }
        
        if (result.skipped) {
            return res.status(200).json({
                success: true,
                message: `Skipped: a newsletter was already sent in the last ${MIN_DAYS_BETWEEN_SENDS} days`,
                postId: result.id
            });
        }
        
        res.status(200).json({
            success: true,
            message: `Newsletter emailed to subscribers!`,
            postId: result.id,
            status: result.status
        });
    } catch (error) {
        console.error('Newsletter cron job error:', error);
        res.status(500).json({
            success: false,
            message: `Newsletter creation failed: ${error.message}`
        });
    }
};
