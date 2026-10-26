from pathlib import Path
p = Path('src/scenario-builder/ProfileEditor.tsx')
s = p.read_text()
s = s.replace("  const { memberships, active, setActiveOrganisation } = useOrganisations()\n  const [scope, setScope] = useState<LibraryScope>(() => active ? 'organisation' : 'user')", "  const { memberships, active, loading: organisationsLoading, setActiveOrganisation } = useOrganisations()\n  const [scope, setScope] = useState<LibraryScope>('organisation')")
s = s.replace("  useEffect(() => {\n    if (!active && scope === 'organisation') setScope('user')\n  }, [active?.organisation.id, scope])", "  useEffect(() => {\n    if (!organisationsLoading && !active && scope === 'organisation') setScope('user')\n  }, [organisationsLoading, active?.organisation.id, scope])")
p.write_text(s)
