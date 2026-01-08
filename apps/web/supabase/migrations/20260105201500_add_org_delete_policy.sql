-- Allow only org owners to delete organizations.
drop policy if exists "org_delete_owner" on public.organizations;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'org_members'
  ) then
    execute
      'create policy "org_delete_owner"
       on public.organizations
       for delete
       to authenticated
       using (
         exists (
           select 1
           from public.org_members m
           where m.org_id = id
             and m.user_id = auth.uid()
             and m.role = ''owner''
         )
       )';
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organization_members'
      and column_name = 'organization_id'
  ) then
    execute
      'create policy "org_delete_owner"
       on public.organizations
       for delete
       to authenticated
       using (
         exists (
           select 1
           from public.organization_members m
           where m.organization_id = id
             and m.user_id = auth.uid()
             and m.role = ''owner''
         )
       )';
  else
    execute
      'create policy "org_delete_owner"
       on public.organizations
       for delete
       to authenticated
       using (
         exists (
           select 1
           from public.organization_members m
           where m.org_id = id
             and m.user_id = auth.uid()
             and m.role = ''owner''
         )
       )';
  end if;
end $$;
