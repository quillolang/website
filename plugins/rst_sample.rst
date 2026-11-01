=============
 Quillo Guide
=============

:Author: Ada Lovelace
:Version: 1.2
:Abstract: A short guide
    that goes on over lines.

.. contents:: On this page

Introduction
============

Some *emphasis*, **strong** words and ``literal <code>`` text, with `a phrase`_,
a `named link <https://example.org/a>`_, plain-name_, an anonymous `one`__ and
https://example.org/bare. See `Using it`_ below, |project| and |logo|, and a note [1]_,
another [#auto]_ and a citation [CIT2002]_. Roles: :code:`x = 1`, :sub:`2`, :sup:`3`,
:title:`Dune`, :rfc:`2822`, :pep:`8`. A `default role`. Escapes: \*not em\* and 2 * 3 * 4.

.. _a phrase: https://example.org/phrase
.. _plain-name: https://example.org/plain
__ https://example.org/anon
.. _go-there: a phrase_
.. |project| replace:: *Quillo*
.. |logo| image:: logo.png
.. [1] The first note.
.. [#auto] A numbered note.
.. [CIT2002] A citation
   over two lines.

Using it
--------

An example::

    $ quillo run <file>
      indented & kept

A paragraph with its own colon: ::

    second block

Lists
~~~~~

- one
- two

  * nested

  with a paragraph

3. third
#. fourth

(a) letter a
(b) letter b

term
    Its definition.
other : classifier
    Second one.

:field one: first
:field two: second
    goes on

| Line one
|   Line two
| Line three

    A block quote
    over lines.

>>> print("doctest")
doctest

Tables
~~~~~~

+-------+-------+
| Head  | Two   |
+=======+=======+
| a     | b     |
+-------+-------+
| spans both    |
+-------+-------+
| c     | - li  |
| more  | - st  |
+-------+-------+

=====  =====
Name   Size
=====  =====
a      1
b      2
       cont.
=====  =====

.. list-table:: Sizes
   :header-rows: 1

   * - Kind
     - Note
   * - one
     - two

.. csv-table::
   :header: "A", "B, c"

   1, "x, y"
   2, z

Directives
~~~~~~~~~~

.. note:: Read *this*.

   And that.

.. warning::

   Careful.

.. admonition:: My title

   Custom.

.. code-block:: python
   :linenos:

   def f(x):
       return x < 1

.. image:: pic.png
   :alt: A picture
   :width: 200

.. figure:: fig.png
   :alt: A figure

   The caption.

.. raw:: html

   <script>alert(1)</script>

.. include:: other.rst

.. frobnicate:: arg

   body

.. a comment
   over two lines

`bad link <javascript:alert(1)>`_ and no_such_ target and |nope| and :madeup:`role`.

----

Too short
=====

The end.
