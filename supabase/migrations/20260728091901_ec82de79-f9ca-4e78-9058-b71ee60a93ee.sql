UPDATE public.websites
SET contentful_delivery_token_secret = 'CONTENTFUL_API_KEY_1',
    contentful_space_id = NULL
WHERE domain = 'udyamregistrations.in';

UPDATE public.websites
SET contentful_delivery_token_secret = 'CONTENTFUL_API_KEY'
WHERE domain = 'udyamadhar.in';