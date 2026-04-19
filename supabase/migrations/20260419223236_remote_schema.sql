alter table "public"."users" drop constraint "location_valid";

alter table "public"."users" drop column "is_active";

alter table "public"."users" add constraint "location_valid" CHECK (((location IS NULL) OR (((extensions.st_x((location)::extensions.geometry) >= ('-180'::integer)::double precision) AND (extensions.st_x((location)::extensions.geometry) <= (180)::double precision)) AND ((extensions.st_y((location)::extensions.geometry) >= ('-90'::integer)::double precision) AND (extensions.st_y((location)::extensions.geometry) <= (90)::double precision))))) not valid;

alter table "public"."users" validate constraint "location_valid";


