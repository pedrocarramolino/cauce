-- (Proyecto AulaMia) Las cuentas creadas desde Cauce llevan app = 'cauce' en sus metadatos:
-- no se les crea perfil de AulaMia. El resto de registros sigue igual que antes.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.raw_user_meta_data ->> 'app' = 'cauce' then
    return new;
  end if;
  insert into public.perfil (id, email, nombre)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$function$;
