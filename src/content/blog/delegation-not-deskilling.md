---
title: 'Delegation, not deskilling'
description: 'A note from someone who started using LLMs heavily right as he shifted from writing code to owning product and architecture. The move from coder to operator of an agentic team is not the loss of a craft — it is the same step up the abstraction ladder our profession has taken many times before.'
date: 2026-06-20
tags: [process, meta, opinion]
order: 9
---

A podcast I listen to spent its 529th episode on LLMs, so let me stir the pot. This is
one thought, from someone who started using these tools heavily at roughly the same time
he started spending more of his week on product and architecture than on writing code.

## I made myself stop reviewing every letter

At some point I pulled myself away — on purpose, by force — from reviewing every character
an LLM produced. What pushed me there was a single idea: **delegation**.

As a specialist I now have a wider view of the product I build. I can shape its
architecture, set the concepts of clean code it has to follow, wire the pipelines, and
make tests mandatory. The act of writing the code I can hand to an AI — the same way I
would hand it to a team. That frees me to think about the product I ship rather than the
implementation of each function. I become a small product owner, a small manager, of my
own (or the company's) product.

And a manager who cannot delegate is a bad manager. The one who, instead of setting up a
process and a framework, drifts into micromanagement and inspects what the subordinate
wrote in every commit — that person has stopped managing.

## "But am I getting dumber?"

The episode raised the deskilling worry, and it deserves a straight answer. Does this
shift make me a weaker developer? A duller one?

There is nothing new in the worry or in the process underneath it. Every time a
technological step appears and a new kind of specialist starts working one layer of
abstraction higher, with far more output per hour, exactly this happens: some of the
knowledge a workshop hand needed to cut metal by hand is no longer needed by the operator
of a CNC machine.

Yes — a master joiner, the kind whose trade is handed down, can carve a miniature figure
more precise than any mill will manage. But the mill turns out a hundred of the parts the
market actually wants, at a level of complexity that would take the joiner a lifetime to
match by hand. One keeps a rare craft alive; the other feeds a factory. Both are real.
They are not the same job.

## We have done this several times already

Our own profession has run this loop before, more than once.

The first programs were punched on cards by physicists and mathematicians, and the program
was inseparable from the body of the machine it ran on. Then progress moved development up
a layer, and with every step some knowledge stopped being needed while new knowledge — and
new kinds of programs — appeared. Each move lost something and gained more.

- Programs in assembly were not as portable or as reliable as programs in C.
- C++ brought concepts that bloated the code but made it maintainable at a size assembly
  could never reach.
- The C++ crowd, at the dawn of Java, made memes about how Java developers, ignorant of
  how memory works, let their virtual machine eat all of it. And it was precisely those
  developers and that JVM — the one that would run code on anything down to a flat-iron —
  who gave us the enterprise boom and Android.

Every generation flamed the next one for the skills it was about to lose. And every next
generation pushed development to a new level, producing a jump in quantity and — once the
processes, the standards, and the school of skills had settled — in the quality of what
got built.

## Coders and operators

We are in one of those transitional times right now. There are joiners and there are CNC
operators. There are coders and there are operators of LLMs.

So this is delegation of routine and a step onto a new layer of abstraction — new
knowledge that raises output per hour. Call it that, not deskilling and not going soft.
For now it comes with caveats, because the transition is unfinished, but the direction is
not in doubt.

You can sit and wish for the AI bubble to pop, the way some once wished for a crisis that
would send the city worker back to the village. But if we are talking about the progress of
a species that does not, barring catastrophe, roll back a rung — then this is the
direction of travel.

## The code I still can't let pass

None of this cancels the fact that I may *enjoy* writing beautiful code. Like the two hosts
of that podcast, I have code I cannot let through untouched. Often it has nothing to do with
the quality of the product; often it is just a preference rooted in my professional
deformation — the warp the trade leaves in you. It is geekiness. My hobby, my sense of what
is beautiful.

But if, inside a working process, I cannot get past it — if I cannot automate everything
except what a rational product requirement actually demands — then I am knitting on company
time. If I can afford that, fine. On average, though, it is not what production needs; it is
my hobby wearing a work badge.

What the factory and the progress behind it increasingly need are managers of agentic
teams with the skill of a professional LLM operator — and fewer free artists working in
JavaScript by hand.

---

*A footnote in keeping with this site: an essay arguing that the operator's craft is real
should show it. This one was drafted by hand and then run through the repository's
[LLM-smell linter](/essays/why-this-site) — the same gate every article here passes —
so that a piece about delegating to machines does not itself read like a machine wrote it.
That is the operator's job: set the standard, then make the work meet it.*
