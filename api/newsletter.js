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
        
        // Shuffle and pick 4 random posts (1 hero + 3 weekly picks)
        const shuffled = posts.sort(() => Math.random() - 0.5);
        const selectedPosts = shuffled.slice(0, 4);
        
        return {
            hero: {
                url: selectedPosts[0].feature_image,
                originalUrl: selectedPosts[0].url,
                title: selectedPosts[0].title
            },
            picks: [
                {
                    url: selectedPosts[1].feature_image,
                    originalUrl: selectedPosts[1].url,
                    title: selectedPosts[1].title
                },
                {
                    url: selectedPosts[2].feature_image,
                    originalUrl: selectedPosts[2].url,
                    title: selectedPosts[2].title
                },
                {
                    url: selectedPosts[3].feature_image,
                    originalUrl: selectedPosts[3].url,
                    title: selectedPosts[3].title
                }
            ]
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
        // Get 4 random images from Ghost posts
        console.log('Fetching random images from Ghost...');
        const images = await getRandomImagesFromGhost();
        
        console.log('Hero image:', images.hero.title);
        console.log('Pick 1:', images.picks[0].title);
        console.log('Pick 2:', images.picks[1].title);
        console.log('Pick 3:', images.picks[2].title);
        
        // Build the newsletter content using Lexical format
        const newsletterTitle = `Weekly Newsletter - ${formatDate(new Date())}`;
        
        const lexicalContent = {
            root: {
                children: [
                    // Hero image
                    {
                        type: 'image',
                        src: images.hero.url,
                        alt: 'Newsletter hero image',
                        caption: images.hero.originalUrl,
                        href: images.hero.originalUrl
                    },
                    // Welcome paragraph
                    {
                        type: 'paragraph',
                        children: [
                            {
                                type: 'text',
                                text: "Welcome to this week's newsletter!"
                            }
                        ]
                    },
                    // "Our Weekly Picks" heading
                    {
                        type: 'heading',
                        tag: 'h2',
                        children: [
                            {
                                type: 'text',
                                text: 'Our Weekly Picks'
                            }
                        ]
                    },
                    // Pick 1
                    {
                        type: 'heading',
                        tag: 'h3',
                        children: [
                            {
                                type: 'text',
                                text: images.picks[0].title
                            }
                        ]
                    },
                    {
                        type: 'image',
                        src: images.picks[0].url,
                        alt: images.picks[0].title,
                        caption: images.picks[0].originalUrl,
                        href: images.picks[0].originalUrl
                    },
                    // Pick 2
                    {
                        type: 'heading',
                        tag: 'h3',
                        children: [
                            {
                                type: 'text',
                                text: images.picks[1].title
                            }
                        ]
                    },
                    {
                        type: 'image',
                        src: images.picks[1].url,
                        alt: images.picks[1].title,
                        caption: images.picks[1].originalUrl,
                        href: images.picks[1].originalUrl
                    },
                    // Pick 3
                    {
                        type: 'heading',
                        tag: 'h3',
                        children: [
                            {
                                type: 'text',
                                text: images.picks[2].title
                            }
                        ]
                    },
                    {
                        type: 'image',
                        src: images.picks[2].url,
                        alt: images.picks[2].title,
                        caption: images.picks[2].originalUrl,
                        href: images.picks[2].originalUrl
                    },
                    // Closing paragraph
                    {
                        type: 'paragraph',
                        children: [
                            {
                                type: 'text',
                                text: 'Thank you for being part of our community. Have a great weekend!'
                            }
                        ]
                    }
                ],
                direction: null,
                format: '',
                indent: 0,
                type: 'root',
                version: 1
            }
        };
        
        console.log('Lexical content created with', lexicalContent.root.children.length, 'cards');
        
        // Create the draft post using lexical format
        const newPost = await api.posts.add({
            title: newsletterTitle,
            lexical: JSON.stringify(lexicalContent),
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
