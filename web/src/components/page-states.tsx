import { Link, type ErrorComponentProps } from '@tanstack/react-router'
import { errorMessage } from '@/api/errors'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export function PageLoading() {
  return (
    <div className="flex h-64 items-center justify-center text-muted-foreground">
      <Spinner className="size-6" />
    </div>
  )
}

export function PageError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h2 className="text-lg font-semibold">Stránku se nepodařilo načíst</h2>
      <p className="text-sm text-muted-foreground">{errorMessage(error)}</p>
      <Button variant="outline" onClick={reset}>
        Zkusit znovu
      </Button>
    </div>
  )
}

export function PageNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-20 text-center">
      <h2 className="text-lg font-semibold">Stránka neexistuje</h2>
      <Button variant="outline" render={<Link to="/" />}>
        Na úvod
      </Button>
    </div>
  )
}
