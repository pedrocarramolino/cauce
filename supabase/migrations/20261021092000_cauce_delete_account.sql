-- Eliminar cuenta desde Cauce: borra siempre los datos de Cauce del usuario.
-- La cuenta (auth.users) solo se borra si no la usa también AulaMia (no tiene perfil allí).
create or replace function public.cauce_delete_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); removed boolean := false;
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from cauce.tasks where user_id = uid;
  delete from cauce.user_settings where user_id = uid;
  if not exists (select 1 from public.perfil where id = uid) then
    delete from auth.users where id = uid;
    removed := true;
  end if;
  return jsonb_build_object('ok', true, 'account_deleted', removed);
end; $$;
revoke execute on function public.cauce_delete_account() from public, anon;
grant execute on function public.cauce_delete_account() to authenticated;
