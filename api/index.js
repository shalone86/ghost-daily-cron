const GhostAdminAPI = require('@tryghost/admin-api');

// ⚠️ Get secrets from environment variables (safe and secure)
const ADMIN_API_URL = process.env.GHOST_ADMIN_URL;
const ADMIN_API_KEY = process.env.GHOST_ADMIN_KEY;
const PERMANENT_FEATURE_TAG = 'hash-permanent-feature'; 

const api = new GhostAdminAPI({
    url: ADMIN_API_URL,
    key: ADMIN_API_KEY,
    version: 'v5.0' // Ghost API version
});

async function updateFeaturedPost() {
    console.log('Starting updateFeaturedPost...');
    
    // 1. Unfeature dynamic posts
    const filterToUnfeature = `featured:true+tag:-${PERMANENT_FEATURE_TAG}+visibility:public`;
    
    let postsToUnfeature = [];
    try {
        const dynamicFeaturedResponse = await api.posts.browse({
            filter: filterToUnfeature,
            limit: 'all'
        });
        postsToUnfeature = dynamicFeaturedResponse || [];
        console.log(`Found ${postsToUnfeature.length} posts to unfeature`);
    } catch (e) {
        console.error('Error fetching dynamic featured posts for unfeaturing:', e.message);
    }
    
    for (const currentFeatured of postsToUnfeature) {
        try {
            await api.posts.edit({
                id: currentFeatured.id,
                updated_at: currentFeatured.updated_at,
                featured: false
            });
            console.log(`Unfeatured: ${currentFeatured.title}`);
        } catch (e) {
            console.error(`Failed to unfeature ${currentFeatured.id}:`, e.message);
        }
    }
    
    // 2. Fetch ALL published posts
    const filterForSelection = `status:published`;
    
    let allPosts;
    try {
        allPosts = await api.posts.browse({
            filter: filterForSelection,
            limit: 'all'
        });
        
        console.log(`Fetched ${allPosts.length} total published posts`);
    } catch (e) {
        throw new Error(`Failed to fetch published posts: ${e.message}`);
    }
    
    if (!allPosts || allPosts.length === 0) {
        throw new Error('No published posts found. Check your Ghost Admin API key permissions.');
    }
    
    // 3. Select 3 random posts
    const numberOfPostsToFeature = Math.min(3, allPosts.length);
    const shuffled = allPosts.sort(() => Math.random() - 0.5);
    const selectedPosts = shuffled.slice(0, numberOfPostsToFeature);
    
    console.log(`Selected ${selectedPosts.length} random posts to feature`);
    
    // 4. Feature the selected posts
    const featuredTitles = [];
    for (const post of selectedPosts) {
        try {
            const updatedPost = await api.posts.edit({ 
                id: post.id,
                updated_at: post.updated_at,
                featured: true 
            });
            console.log(`Successfully featured: ${updatedPost.title}`);
            featuredTitles.push(updatedPost.title);
        } catch (e) {
            console.error(`Failed to feature ${post.title}:`, e.message);
        }
    }
    
    if (featuredTitles.length === 0) {
        throw new Error('Failed to feature any posts');
    }
    
    return featuredTitles;
}

// 4. Serverless function handler
module.exports = async (req, res) => {
    try {
        const titles = await updateFeaturedPost();
        res.status(200).json({ 
            success: true, 
            message: `Successfully featured ${titles.length} posts: ${titles.join(', ')}` 
        });
    } catch (error) {
        console.error('Cron job error:', error);
        res.status(500).json({ 
            success: false, 
            message: `Cron job failed: ${error.message}` 
        });
    }
}
