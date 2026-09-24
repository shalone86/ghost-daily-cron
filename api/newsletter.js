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

const GRID_SIZE = 6;

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

// Ask Ghost for a smaller copy of its own images so the email stays light
function thumbnailUrl(url) {
    if (url.includes('/content/images/') && !url.includes('/content/images/size/')) {
        return url.replace('/content/images/', '/content/images/size/w600/');
    }
    return url;
}

// Email-safe 3-column grid (tables render in Gmail and Outlook)
function buildGridHtml(posts) {
    const cells = posts.map(post => `
        <td width="33%" valign="top" style="padding:4px;vertical-align:top;">
            <a href="${escapeHtml(post.url)}" style="text-decoration:none;color:inherit;">
                <img src="${escapeHtml(thumbnailUrl(post.feature_image))}" alt="${escapeHtml(post.title)}" width="180" style="display:block;width:100%;height:auto;border:0;">
                <span style="display:block;margin-top:6px;font-size:13px;line-height:1.3;">${escapeHtml(post.title)}</span>
            </a>
        </td>`);
    
    const rows = [];
    for (let i = 0; i < cells.length; i += 3) {
        const row = cells.slice(i, i + 3);
        while (row.length < 3) row.push('<td width="33%" style="padding:4px;"></td>');
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
    
    // 2. Pick this week's images
    const { hero, grid } = await pickPosts();
    console.log('Hero:', hero.title);
    grid.forEach(post => console.log('Grid:', post.title));
    
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
                children: [{ type: 'text', text: grid.length === 1 ? 'One more' : `${['Two', 'Three', 'Four', 'Five', 'Six'][grid.length - 2]} more` }]
            },
            { type: 'html', version: 1, html: buildGridHtml(grid) }
        );
    }
    
    children.push(
        // Shown only to free members
        {
            type: 'email-cta',
            version: 1,
            segment: 'status:free',
            alignment: 'left',
            showDividers: true,
            showButton: true,
            buttonText: 'Give a gift',
            buttonUrl: `${siteUrl}/#/portal/support`,
            html: '<p><strong>All our images are free to download</strong></p>' +
                "<p>We gather sacred art from museums around the world, make sure it's in the public domain, and sort it for Catholics so you don't have to search. If it has helped your prayer, your home or your parish, would you help keep it free?</p>" +
                `<p>Or <a href="${siteUrl}/#/portal/account/plans">become a supporter</a>.</p>`
        },
        // Shown only to paid members
        {
            type: 'email-cta',
            version: 1,
            segment: 'status:-free',
            alignment: 'left',
            showDividers: true,
            showButton: false,
            buttonText: '',
            buttonUrl: '',
            html: '<p><strong>Thank you, and God bless you</strong></p>' +
                '<p>Your generosity keeps this beauty free for everyone who comes looking. You are remembered in our prayers.</p>'
        }
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
    const newsletterTitle = grid.length > 0 ? `${hero.title} + ${grid.length} more` : hero.title;
    
    // 4. STEP 1: Create the post as a DRAFT marked as email_only
    const draftData = {
        title: newsletterTitle,
        lexical: JSON.stringify(lexicalContent),
        tags: ['newsletter'],
        feature_image: hero.feature_image,
        feature_image_alt: hero.title,
        feature_image_caption: `<a href="${escapeHtml(hero.url)}">${escapeHtml(hero.title)}</a>`,
        status: 'draft',
        email_only: true // Keeps it off the website feed
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
