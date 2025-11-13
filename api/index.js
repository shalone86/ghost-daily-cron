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
    
    // 2. Fetch the newest PUBLISHED post
    const filterForSelection = `status:published`;
    
    let newFeaturedPost;
    try {
        const data = await api.posts.browse({
            filter: filterForSelection,
            limit: 1, 
            order: 'published_at DESC'
        });
        
        newFeaturedPost = data && data.length > 0 ? data[0] : null;
        console.log('Fetched posts data:', data);
    } catch (e) {
        throw new Error(`Failed to fetch the newest post: ${e.message}`);
    }
    
    if (!newFeaturedPost) {
        throw new Error('No published posts found. Check your Ghost Admin API key permissions.');
    }
    
    console.log(`Selected post to feature: ${newFeaturedPost.title}`);
    
    // 3. Feature the new post
    try {
        const updatedPost = await api.posts.edit({ 
            id: newFeaturedPost.id,
            updated_at: newFeaturedPost.updated_at,
            featured: true 
        });
        console.log(`Successfully featured: ${updatedPost.title}`);
        return updatedPost.title;
    } catch (e) {
        throw new Error(`Failed to feature post: ${e.message}`);
    }
}

// 4. Serverless function handler
module.exports = async (req, res) => {
    try {
        const title = await updateFeaturedPost();
        res.status(200).json({ 
            success: true, 
            message: `Successfully featured new post: ${title}` 
        });
    } catch (error) {
        console.error('Cron job error:', error);
        res.status(500).json({ 
            success: false, 
            message: `Cron job failed: ${error.message}` 
        });
    }
}
