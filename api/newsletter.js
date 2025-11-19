const GhostAdminAPI = require('@tryghost/admin-api');

// ⚠️ Get secrets from environment variables (safe and secure)
const ADMIN_API_URL = process.env.GHOST_ADMIN_URL;
const ADMIN_API_KEY = process.env.GHOST_ADMIN_KEY;

const api = new GhostAdminAPI({
    url: ADMIN_API_URL,
    key: ADMIN_API_KEY,
    version: 'v5.0'
});

async function getRandomImagesFromGhost() {
    try {
        // Fetch all published posts that have feature images
        const posts = await api.posts.browse({
            filter: 'status:published+feature_image:-null',
            limit: 'all',
            fields: 'feature_image,url,title'
        });
        
        if (!posts || posts.length === 0) {
            throw new Error('No posts with feature images found');
        }
        
        console.log(`Found ${posts.length} posts with images`);
        
        // Shuffle and pick 3 random posts (1 hero + 2 content images)
        const shuffled = posts.sort(() => Math.random() - 0.5);
        const selectedPosts = shuffled.slice(0, 3);
        
        return {
            hero: {
                url: selectedPosts[0].feature_image,
                originalUrl: selectedPosts[0].url,
                title: selectedPosts[0].title
            },
            image1: {
                url: selectedPosts[1].feature_image,
                originalUrl: selectedPosts[1].url,
                title: selectedPosts[1].title
            },
            image2: {
                url: selectedPosts[2].feature_image,
                originalUrl: selectedPosts[2].url,
                title: selectedPosts[2].title
            }
        };
    } catch (error) {
        console.error('Error fetching images from Ghost:', error);
        throw error;
    }
}

function formatDate(date) {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

async function createWeeklyNewsletter() {
    console.log('Starting createWeeklyNewsletter...');
    
    try {
        // Get 3 random images from Ghost posts
        console.log('Fetching random images from Ghost...');
        const images = await getRandomImagesFromGhost();
        
        // Get some recent posts to feature in the newsletter
        const recentPosts = await api.posts.browse({
            filter: 'status:published',
            limit: 5,
            order: 'published_at DESC'
        });
        
        // Build the newsletter content
        const newsletterTitle = `Weekly Newsletter - ${formatDate(new Date())}`;
        
        let postsHtml = '';
        if (recentPosts && recentPosts.length > 0) {
            postsHtml = '<h2>Recent Highlights</h2><ul>';
            recentPosts.forEach(post => {
                postsHtml += `<li><a href="${ADMIN_API_URL}/content/${post.slug}/">${post.title}</a></li>`;
            });
            postsHtml += '</ul>';
        }
        
        const newsletterHtml = `
            <figure>
                <img src="${images.hero.url}" alt="Newsletter hero image">
                <figcaption>${images.hero.originalUrl}</figcaption>
            </figure>
            
            <p>Welcome to this week's newsletter! Here's what's been happening...</p>
            
            ${postsHtml}
            
            <h2>Featured Content</h2>
            
            <figure>
                <img src="${images.image1.url}" alt="Featured image 1">
                <figcaption>${images.image1.originalUrl}</figcaption>
            </figure>
            
            <p>Check out our latest updates and stories from the community.</p>
            
            <figure>
                <img src="${images.image2.url}" alt="Featured image 2">
                <figcaption>${images.image2.originalUrl}</figcaption>
            </figure>
            
            <p>Thank you for being part of our community. Have a great weekend!</p>
        `;
        
        // Create the draft post
        const newPost = await api.posts.add({
            title: newsletterTitle,
            html: newsletterHtml,
            status: 'draft',
            tags: ['newsletter'],
            feature_image: images.hero.url
        });
        
        console.log(`Successfully created newsletter draft: ${newPost.title}`);
        console.log(`Draft ID: ${newPost.id}`);
        
        return {
            success: true,
            postId: newPost.id,
            title: newPost.title,
            url: `${ADMIN_API_URL}/ghost/#/editor/post/${newPost.id}`
        };
        
    } catch (error) {
        console.error('Error creating newsletter:', error);
        throw error;
    }
}

// Serverless function handler
module.exports = async (req, res) => {
    try {
        // Check if it's Friday (or test mode)
        const isTest = req.query.test === 'true';
        const today = new Date().getDay(); // 0 = Sunday, 5 = Friday
        
        if (!isTest && today !== 5) {
            return res.status(200).json({
                success: true,
                message: "Not Friday"
            });
        }
        
        const result = await createWeeklyNewsletter();
        
        if (result.skipped) {
            res.status(200).json({
                success: true,
                message: result.message
            });
        } else {
            res.status(200).json({
                success: true,
                message: `Newsletter draft created: ${result.title}`,
                postId: result.postId,
                editUrl: result.url
            });
        }
    } catch (error) {
        console.error('Newsletter cron job error:', error);
        res.status(500).json({
            success: false,
            message: `Newsletter creation failed: ${error.message}`
        });
    }
};
