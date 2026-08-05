import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FadeIn, HoverLift, StaggerItem, StaggerList } from "@/lib/motion";
import { CircleCheck, CircleX, Menu, MoreVertical, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

export default function DesignGallery() {
  const portals = ["seeker", "recruiter"] as const;
  const themes = ["light", "dark"] as const;

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-7xl space-y-12 p-8">
        <header className="space-y-2">
          <h1 className="font-display text-display-lg text-ink">Design Gallery</h1>
          <p className="text-lg text-ink-muted">
            Ink & Signal token system — all components, both portals, both themes
          </p>
        </header>

        {portals.map((portal) => (
          <div key={portal} data-portal={portal} className="space-y-8">
            <h2 className="font-display text-display-sm capitalize text-signal-text">
              {portal} Portal
            </h2>

            {themes.map((theme) => (
              <div key={theme} className={theme}>
                <div className="space-y-8 rounded-surface border border-line bg-paper p-8">
                  <h3 className="font-display text-xl text-ink">
                    {theme === "light" ? "Light" : "Dark"} Theme
                  </h3>

                  <GallerySection theme={theme} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function GallerySection({ theme }: { theme: "light" | "dark" }) {
  return (
    <div className="space-y-12">
      {/* Token Swatches */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Tokens</h4>
        <div className="flex flex-wrap gap-4">
          {[
            { name: "paper", class: "bg-paper" },
            { name: "paper-sunken", class: "bg-paper-sunken" },
            { name: "paper-raised", class: "bg-paper-raised" },
            { name: "ink", class: "bg-ink" },
            { name: "ink-muted", class: "bg-ink-muted" },
            { name: "line", class: "bg-line" },
            { name: "signal", class: "bg-signal" },
            { name: "signal-text", class: "bg-signal-text" },
            { name: "signal-muted", class: "bg-signal-muted" },
            { name: "danger", class: "bg-danger" },
            { name: "warn", class: "bg-warn" },
            { name: "ok", class: "bg-ok" },
          ].map(({ name, class: className }) => (
            <div key={name} className="flex items-center gap-2">
              <div className={`size-16 rounded-sharp border border-line ${className}`} />
              <span className="font-mono text-xs text-ink-muted">{name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Type Ramp */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Typography</h4>
        <div className="space-y-2">
          <p className="font-display text-display-xl text-ink">Display XL</p>
          <p className="font-display text-display-lg text-ink">Display Large</p>
          <p className="font-display text-display-md text-ink">Display Medium</p>
          <p className="font-display text-display-sm text-ink">Display Small</p>
          <p className="text-xl text-ink">Text XL</p>
          <p className="text-lg text-ink">Text Large</p>
          <p className="text-base text-ink">Text Base</p>
          <p className="text-sm text-ink">Text Small</p>
          <p className="text-xs text-ink">Text XS</p>
          <p className="font-mono text-sm text-ink-muted">Metadata · Geist Mono</p>
        </div>
      </section>

      {/* Buttons */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Button</h4>
        <div className="flex flex-wrap gap-4">
          <Button variant="default">Default</Button>
          <Button variant="signal">Signal</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button size="xs">Extra Small</Button>
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      {/* Badges */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Badge</h4>
        <div className="flex flex-wrap items-center gap-4">
          <Badge variant="default">Default</Badge>
          <Badge variant="signal">Signal</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="ok">
            <CircleCheck className="size-3" />
            OK
          </Badge>
          <Badge variant="warn">
            <TriangleAlert className="size-3" />
            Warning
          </Badge>
          <Badge variant="danger">
            <CircleX className="size-3" />
            Danger
          </Badge>
        </div>
      </section>

      {/* Form Controls */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Form Controls</h4>
        <div className="grid max-w-md gap-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Enter your name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="disabled">Disabled</Label>
            <Input id="disabled" placeholder="Disabled input" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="error">Error</Label>
            <Input id="error" placeholder="Invalid input" aria-invalid />
          </div>
        </div>
      </section>

      {/* Avatar */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Avatar</h4>
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarImage src="https://github.com/shadcn.png" alt="User" />
            <AvatarFallback>CN</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>AB</AvatarFallback>
          </Avatar>
        </div>
      </section>

      {/* Radio & Select */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Radio & Select</h4>
        <RadioGroup defaultValue="option-one" className="gap-2">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="option-one" id="option-one" />
            <Label htmlFor="option-one">Option One</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="option-two" id="option-two" />
            <Label htmlFor="option-two">Option Two</Label>
          </div>
        </RadioGroup>
        <Select>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </section>

      {/* Overlays */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Overlays</h4>
        <div className="flex flex-wrap gap-4">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open Dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dialog Title</DialogTitle>
                <DialogDescription>
                  This is a dialog description with some placeholder text.
                </DialogDescription>
              </DialogHeader>
              <p className="text-sm text-ink">Dialog content goes here.</p>
            </DialogContent>
          </Dialog>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Open Popover</Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="text-sm text-ink">Popover content goes here.</p>
            </PopoverContent>
          </Popover>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover me</Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Tooltip content</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Menu Label</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Item 1</DropdownMenuItem>
              <DropdownMenuItem>Item 2</DropdownMenuItem>
              <DropdownMenuItem>Item 3</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <Menu />
                Open Sheet
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Sheet Title</SheetTitle>
                <SheetDescription>Sheet description text</SheetDescription>
              </SheetHeader>
              <p className="mt-4 text-sm text-ink">Sheet content goes here.</p>
            </SheetContent>
          </Sheet>
        </div>
      </section>

      {/* Tabs */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Tabs</h4>
        <Tabs defaultValue="tab1" className="w-[400px]">
          <TabsList>
            <TabsTrigger value="tab1">Tab 1</TabsTrigger>
            <TabsTrigger value="tab2">Tab 2</TabsTrigger>
            <TabsTrigger value="tab3">Tab 3</TabsTrigger>
          </TabsList>
          <TabsContent value="tab1">
            <p className="text-sm text-ink">Content for tab 1</p>
          </TabsContent>
          <TabsContent value="tab2">
            <p className="text-sm text-ink">Content for tab 2</p>
          </TabsContent>
          <TabsContent value="tab3">
            <p className="text-sm text-ink">Content for tab 3</p>
          </TabsContent>
        </Tabs>
      </section>

      {/* Table */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Table</h4>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Item One</TableCell>
              <TableCell>Active</TableCell>
              <TableCell className="font-mono text-right">1,234</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Item Two</TableCell>
              <TableCell>Pending</TableCell>
              <TableCell className="font-mono text-right">5,678</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Item Three</TableCell>
              <TableCell>Inactive</TableCell>
              <TableCell className="font-mono text-right">9,012</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      {/* Card */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Card</h4>
        <HoverLift>
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Card Title</CardTitle>
              <CardDescription>Card description text goes here</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-ink">
                Card content with some placeholder text to show how it looks.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="signal">Action</Button>
            </CardFooter>
          </Card>
        </HoverLift>
      </section>

      {/* Skeleton & Separator */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Skeleton & Separator</h4>
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
        <Separator />
        <p className="text-sm text-ink-muted">Content after separator</p>
      </section>

      {/* Pagination */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Pagination</h4>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">2</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </section>

      {/* Carousel */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Carousel</h4>
        <Carousel className="w-full max-w-xs">
          <CarouselContent>
            {[1, 2, 3].map((i) => (
              <CarouselItem key={i}>
                <Card>
                  <CardContent className="flex aspect-square items-center justify-center p-6">
                    <span className="font-display text-display-md text-ink">{i}</span>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </section>

      {/* Toast */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Toast</h4>
        <Button
          variant="outline"
          onClick={() =>
            toast("Event has been created", {
              description: `${theme} theme • ${new Date().toLocaleTimeString()}`,
            })
          }
        >
          Show Toast
        </Button>
      </section>

      {/* Motion */}
      <section className="space-y-4">
        <h4 className="text-sm font-medium uppercase tracking-wide text-ink-muted">Motion</h4>
        <StaggerList className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <StaggerItem key={i}>
              <FadeIn>
                <Card>
                  <CardHeader>
                    <CardTitle>Motion Card {i}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-ink-muted">
                      Stagger and fade animations
                    </p>
                  </CardContent>
                </Card>
              </FadeIn>
            </StaggerItem>
          ))}
        </StaggerList>
      </section>
    </div>
  );
}
