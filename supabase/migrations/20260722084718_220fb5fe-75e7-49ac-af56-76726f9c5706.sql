
-- 1. Track editor
ALTER TABLE public.service_form_schemas
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- 2. Upsert helper — creates a new version, deactivates prior ones
CREATE OR REPLACE FUNCTION public.upsert_service_form_schema(
  _service_code text,
  _title text,
  _description text,
  _schema jsonb,
  _documents jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_next  int;
  v_id    uuid;
BEGIN
  IF v_actor IS NULL OR NOT (public.current_user_is_admin() OR public.has_role(v_actor, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'upsert_service_form_schema: forbidden';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM public.service_form_schemas
  WHERE service_code = _service_code;

  UPDATE public.service_form_schemas
     SET is_active = false, updated_at = now()
   WHERE service_code = _service_code AND is_active = true;

  INSERT INTO public.service_form_schemas
    (service_code, version, is_active, title, description, schema, documents, updated_by)
  VALUES
    (_service_code, v_next, true, _title, NULLIF(_description, ''), COALESCE(_schema, '{}'::jsonb), COALESCE(_documents, '[]'::jsonb), v_actor)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'version', v_next);
END $$;

GRANT EXECUTE ON FUNCTION public.upsert_service_form_schema(text, text, text, jsonb, jsonb) TO authenticated;

-- 3. Seed the expanded migrate form
DO $seed$
DECLARE
  v_schema jsonb := jsonb_build_object(
    'sections', jsonb_build_array(
      jsonb_build_object(
        'key', 'existing_uam',
        'label', 'Existing Udyog Aadhaar Details',
        'fields', jsonb_build_array(
          jsonb_build_object('key','applicant_name','label','Applicant Name','type','text','required',true,'maxLength',120),
          jsonb_build_object('key','uam_number','label','Udyog Aadhaar Number','type','text','required',true,'pattern','^[A-Z]{2}\d{2}[A-Z]\d{7}$','placeholder','DL05A0000001','maxLength',12,'help','Format: first 2 alphabets, then 2 digits, then 1 alphabet, then 7 digits.'),
          jsonb_build_object('key','registered_mobile','label','Registered Mobile Number','type','tel','required',false,'pattern','^[6-9]\d{9}$'),
          jsonb_build_object('key','registered_email','label','Registered Email ID','type','email','required',false)
        )
      ),
      jsonb_build_object(
        'key', 'pan_details',
        'label', 'PAN Details',
        'fields', jsonb_build_array(
          jsonb_build_object('key','pan_number','label','Customer PAN Number','type','text','required',true,'pattern','^[A-Z]{5}\d{4}[A-Z]$','placeholder','ABCDE1234F','maxLength',10),
          jsonb_build_object('key','pan_holder_name','label','Name As Per PAN Card','type','text','required',true,'maxLength',120),
          jsonb_build_object('key','pan_dob','label','Date of Birth as per PAN Card','type','date','required',true)
        )
      ),
      jsonb_build_object(
        'key', 'new_udyam_full',
        'label', 'Enterprise, Bank & Activity Details',
        'fields', jsonb_build_array(
          jsonb_build_object('key','aadhaar_number','label','1. Aadhaar Number','type','text','required',true,'pattern','^\d{12}$','placeholder','12 digit Aadhaar number'),
          jsonb_build_object('key','business_type','label','3. Type of Organisation / संगठन के प्रकार','type','select','required',true,'options', jsonb_build_array('Proprietary / एकल स्वामित्व','Hindu Undivided Family / हिंदू अविभाजित परिवार (HUF)','Partnership / पार्टनरशिप','Co-Operative / सहकारी','Private Limited Company / प्राइवेट लिमिटेड कंपनी','Public Limited Company / पब्लिक लिमिटेड कंपनी','Self Help Group / स्वयं सहायता समूह','Limited Liability Partnership / सीमित दायित्व भागीदारी','Society / सोसाइटी','Trust / ट्रस्ट','Others / अन्य')),
          jsonb_build_object('key','itr_previous_year','label','4.2 Have you filed ITR for PY 2024–25?','type','select','required',true,'options', jsonb_build_array('Yes','No')),
          jsonb_build_object('key','gstin_status','label','4.3 Do you have GSTIN?','type','select','required',true,'options', jsonb_build_array('Yes','No','Exempted')),
          jsonb_build_object('key','written_down_value','label','Written Down Value (WDV) as on 31 March 2024–25 (A)','type','number','required',true),
          jsonb_build_object('key','exclusion_cost','label','Exclusion of cost — Pollution Control / R&D / Industrial Safety Devices 2024–25 (B)','type','number','required',true),
          jsonb_build_object('key','total_turnover','label','Total Turnover during 2024–25','type','number','required',true),
          jsonb_build_object('key','business_name','label','8. Name of Enterprise','type','text','required',true,'maxLength',200),
          jsonb_build_object('key','aadhaar_mobile','label','9. Mobile Number (+91)','type','tel','required',true,'pattern','^[6-9]\d{9}$'),
          jsonb_build_object('key','email','label','10. Email','type','email','required',true),
          jsonb_build_object('key','social_category','label','11. Social Category','type','select','required',true,'options', jsonb_build_array('General','SC','ST','OBC')),
          jsonb_build_object('key','gender','label','12. Gender','type','select','required',true,'options', jsonb_build_array('Male','Female','Others')),
          jsonb_build_object('key','specially_abled','label','13. Specially Abled (Divyang)','type','select','required',true,'options', jsonb_build_array('Yes','No')),
          jsonb_build_object('key','section_address','label','14. Official Address of Enterprise','type','section'),
          jsonb_build_object('key','address_flat','label','Flat / Door / Block No.','type','text','required',true,'maxLength',120),
          jsonb_build_object('key','address_premises','label','Name of Premises / Building','type','text','required',false,'maxLength',160),
          jsonb_build_object('key','address_village','label','Village / Town','type','text','required',true,'maxLength',120),
          jsonb_build_object('key','address_block','label','Block','type','text','required',false,'maxLength',120),
          jsonb_build_object('key','address_road','label','Road / Street / Lane','type','text','required',true,'maxLength',160),
          jsonb_build_object('key','city','label','City','type','text','required',true,'maxLength',80),
          jsonb_build_object('key','pincode','label','PIN Code','type','text','required',true,'pattern','^\d{6}$','maxLength',6),
          jsonb_build_object('key','state','label','State','type','select','required',true),
          jsonb_build_object('key','district','label','District','type','select','required',true),
          jsonb_build_object('key','section_plants','label','15. Location of Plant(s) / Unit(s) and Details','type','section'),
          jsonb_build_object('key','plants','label','Add one row for each plant / unit / branch','type','plants'),
          jsonb_build_object('key','previous_registration','label','16. Previous EM-II / UAM Registration Number, if any','type','select','required',true,'options', jsonb_build_array('N/A','EM-II','Previous UAM')),
          jsonb_build_object('key','section_status','label','17. Status of Enterprise','type','section'),
          jsonb_build_object('key','incorporation_date','label','a. Date of Incorporation / Registration','type','date','required',true),
          jsonb_build_object('key','business_commenced','label','b. Whether production / business commenced','type','select','required',true,'options', jsonb_build_array('Yes','No')),
          jsonb_build_object('key','commencement_date','label','Date of Commencement','type','date','required',true),
          jsonb_build_object('key','section_bank','label','18. Bank Details','type','section'),
          jsonb_build_object('key','bank_name','label','Bank Name','type','text','required',true,'maxLength',120),
          jsonb_build_object('key','bank_ifsc','label','IFSC Code','type','text','required',true,'pattern','^[A-Z]{4}0[A-Z0-9]{6}$','maxLength',11),
          jsonb_build_object('key','bank_account_no','label','Bank Account Number','type','text','required',true,'maxLength',30),
          jsonb_build_object('key','major_activity','label','19. Major Activity of Unit','type','select','required',true,'options', jsonb_build_array('Manufacturing','Services','Trading')),
          jsonb_build_object('key','major_activity_sub','label','19.1 Major Activity Under Services','type','select','required',false,'options', jsonb_build_array('Non-Trading','Trading'),'help','Required only if Major Activity is Services.'),
          jsonb_build_object('key','section_nic','label','20. National Industrial Classification (NIC) Code for Activities','type','section'),
          jsonb_build_object('key','nic_2_digit','label','NIC 2 Digit Code','type','nic','required',true,'nicDigits',2,'activityFrom','major_activity'),
          jsonb_build_object('key','nic_4_digit','label','NIC 4 Digit Code','type','nic','required',true,'nicDigits',4,'activityFrom','major_activity'),
          jsonb_build_object('key','nic_5_digit','label','NIC 5 Digit Code','type','nic','required',true,'nicDigits',5,'activityFrom','major_activity'),
          jsonb_build_object('key','section_employees','label','21. Number of persons employed','type','section'),
          jsonb_build_object('key','employees_male','label','Male','type','number','required',true),
          jsonb_build_object('key','employees_female','label','Female','type','number','required',true),
          jsonb_build_object('key','employees_others','label','Others','type','number','required',true),
          jsonb_build_object('key','gem_registration','label','22. Interested in Government e-Marketplace (GeM) Portal?','type','select','required',true,'options', jsonb_build_array('Yes','No')),
          jsonb_build_object('key','treds_registration','label','23. Interested in TReDS Portals?','type','select','required',true,'options', jsonb_build_array('Yes','No')),
          jsonb_build_object('key','ncs_registration','label','24. Interested in National Career Service (NCS) Portal?','type','select','required',true,'options', jsonb_build_array('Yes','No')),
          jsonb_build_object('key','nsic_b2b_registration','label','25. Interested in NSIC B2B Portal?','type','select','required',true,'options', jsonb_build_array('Yes','No')),
          jsonb_build_object('key','skill_india_registration','label','27. Interested in Skill India Digital Portal?','type','select','required',true,'options', jsonb_build_array('Yes','No'))
        )
      )
    )
  );
  v_next int;
BEGIN
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next
  FROM public.service_form_schemas
  WHERE service_code = 'migrate-udyog-aadhaar-to-udyam';

  UPDATE public.service_form_schemas
     SET is_active = false, updated_at = now()
   WHERE service_code = 'migrate-udyog-aadhaar-to-udyam' AND is_active = true;

  INSERT INTO public.service_form_schemas
    (service_code, version, is_active, title, description, schema, documents)
  VALUES (
    'migrate-udyog-aadhaar-to-udyam',
    v_next,
    true,
    'Migrate Udyog Aadhaar to Udyam — Full Details',
    'Share your existing Udyog Aadhaar details, PAN information and enterprise details so our team can prepare your migration to Udyam.',
    v_schema,
    '[]'::jsonb
  );
END $seed$;
