const GhostAdminAPI = require('@tryghost/admin-api');

// ⚠️ Get secrets from environment variables (safe and secure)
const ADMIN_API_URL = process.env.GHOST_ADMIN_URL;
const ADMIN_API_KEY = process.env.GHOST_ADMIN_KEY;
const PERMANENT_FEATURE_TAG = 'hash-permanent-feature'; 

const api = new GhostAdminAPI({
    url: ADMIN_API_URL,
    key: ADMIN_API_KEY,
    version: 'v6.0' // Make sure this matches your Ghost version
});

// ... (The rest of the script remains the same above this function)

async function updateFeaturedPost() {
    // 1. Unfeature dynamic posts (original logic remains the same)
    const filterToUnfeature = `featured:true+tag:-${PERMANENT_FEATURE_TAG}+visibility:public`;
    
    let postsToUnfeature = [];
    try {
        const dynamicFeaturedResponse = await api.posts.browse({
            filter: filterToUnfeature,
            limit: 'all'
        });
        postsToUnfeature = dynamicFeaturedResponse.posts || []; 
    } catch (e) {
        console.error('Error fetching dynamic featured posts for unfeaturing:', e.message);
    }

    for (const currentFeatured of postsToUnfeature) {
        await api.posts.edit({ ...currentFeatured, featured: false });
    }

    // 2. ABSOLUTE FAIL-SAFE TEST: Fetch the newest PUBLISHED post with NO FILTERS
    const filterForSelection = `status:published`; // ***NO TAG OR VISIBILITY FILTERS***
    
    let newFeaturedPost;
    try {
        const data = await api.posts.browse({
            filter: filterForSelection,
            limit: 1, 
            order: 'published_at DESC'
        });
        
        newFeaturedPost = data.posts && data.posts.length > 0 ? data.posts[0] : null;

    } catch (e) {
        throw new Error(`Failed to fetch the newest post (UNFILTERED TEST): ${e.message}`);
    }

    if (!newFeaturedPost) {
        // If this fails, the key cannot even read published posts.
        throw new Error('TEST FAILED: Could not find ANY published post with NO FILTERS. Your Ghost Admin API Key is faulty.');
    }

    // 3. Feature the new post
    const updatedPost = await api.posts.edit({ ...newFeaturedPost, featured: true });
    return updatedPost.title;
}

// 4. The function handler that the serverless environment expects
module.exports = async (req, res) => {
    try {
        const title = await updateFeaturedPost();
        // Return a successful HTTP response that EasyCron expects
        res.status(200).json({ 
            success: true, 
            message: `Successfully featured new post: ${title}` 
        });
    } catch (error) {
        // Return an error HTTP response if the job fails
        res.status(500).json({ 
            success: false, 
            message: `Cron job failed: ${error.message}` 
        });
    }
}
