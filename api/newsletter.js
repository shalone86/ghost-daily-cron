async function createWeeklyNewsletter() {
    console.log('Starting createWeeklyNewsletter...');
    
    // 1. Automatically fetch your active newsletter slug
    console.log('Fetching active newsletter configuration...');
    const newsletters = await api.newsletters.browse({ filter: 'status:active', limit: 1 });
    if (!newsletters || newsletters.length === 0) {
        throw new Error('No active newsletter found in Ghost setup.');
    }
    const newsletterSlug = newsletters[0].slug;
    console.log(`Targeting newsletter: ${newsletterSlug}`);

    // 2. Fetch random images from Ghost posts
    console.log('Fetching random images from Ghost...');
    const images = await getRandomImagesFromGhost();
    
    // 3. Build the newsletter content using Lexical format
    const newsletterTitle = `Weekly Newsletter`;
    const lexicalContent = {
        root: {
            children: [
                {
                    type: 'heading',
                    tag: 'h1',
                    children: [{ type: 'text', text: "Welcome to this week's newsletter! Enjoy our Weekly Picks:" }]
                },
                { type: 'horizontalrule' },
                // Pick 1
                {
                    type: 'heading',
                    tag: 'h3',
                    children: [{ type: 'text', text: images.picks[0].title }]
                },
                {
                    type: 'image',
                    src: images.picks[0].url,
                    alt: images.picks[0].title,
                    href: images.picks[0].originalUrl,
                    caption: `<a href="${images.picks[0].originalUrl}">read more</a>`
                },
                // Pick 2
                {
                    type: 'heading',
                    tag: 'h3',
                    children: [{ type: 'text', text: images.picks[1].title }]
                },
                {
                    type: 'image',
                    src: images.picks[1].url,
                    alt: images.picks[1].title,
                    href: images.picks[1].originalUrl,
                    caption: `<a href="${images.picks[1].originalUrl}">read more</a>`
                },
                // Pick 3
                {
                    type: 'heading',
                    tag: 'h3',
                    children: [{ type: 'text', text: images.picks[2].title }]
                },
                {
                    type: 'image',
                    src: images.picks[2].url,
                    alt: images.picks[2].title,
                    href: images.picks[2].originalUrl,
                    caption: `<a href="${images.picks[2].originalUrl}">read more</a>`
                },
                {
                    type: 'callout',
                    calloutEmoji: '💌',
                    calloutText: 'Thank you for being part of our community. Have a great weekend!'
                }
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1
        }
    };
    
    // 4. STEP 1: Create the post as a DRAFT marked as email_only
    const draftData = {
        title: newsletterTitle,
        lexical: JSON.stringify(lexicalContent),
        tags: ['newsletter'],
        feature_image: images.hero.url,
        feature_image_caption: `<a href="${images.hero.originalUrl}">read more</a>`,
        status: 'draft',
        email_only: true // Ensures it prepares for email delivery system
    };
    
    console.log('Creating newsletter draft...');
    const draftPost = await api.posts.add(draftData);
    
    // 5. STEP 2: Publish the draft with newsletter tracking parameters to blast it out
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
